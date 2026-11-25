"""The shared lists: the operations that change them, the log that keeps them in order, and the catch-up that
tells a device what changed since it last looked (design/family-app/notes.md, How sync works).

Every change is an operation with an id made on the device, and every item's id is made on the device too, so
an item added offline needs no id swapping. The server applies operations in the order they arrive, gives each
the list's next sequence number, and decides how they merge. Clients never merge: they send operations, and
show the items' states the catch-up returns.

The Shopping list's Shops, each with the walking order it has learned (#84), are changed by operations too,
and kept in the same partition.

Each list is one partition. Applying an operation reads the list's counter and the item or Shop, works out its
new state, then writes the counter, the operation and the item or Shop together, or not at all. If another
request wrote first, the write is refused and the operation is tried again from the start.
"""

import string
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

# How long a ticked-off item stays on screen, so a mis-tap can be undone. The Hub already shows the Shopping
# list this way.
TICKED_OFF_SHOWN_FOR = timedelta(minutes=10)

# The most operations one request can carry.
MOST_OPERATIONS = 100

# How many times an operation is tried when other requests keep writing first.
ATTEMPTS = 10

# The most item names a shop's order keeps. Placing one more drops the name placed longest ago.
MOST_PLACED = 500

ItemText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ShopName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class _Operation(BaseModel):
    id: UUID
    item_id: UUID


class Add(_Operation):
    type: Literal["add"]
    text: ItemText


class Tick(_Operation):
    type: Literal["tick"]


class Untick(_Operation):
    type: Literal["untick"]


class Rename(_Operation):
    type: Literal["rename"]
    text: ItemText


class Remove(_Operation):
    type: Literal["remove"]


class AddShop(BaseModel):
    """A shop the list can be sorted for, in its walking order (#84). The shop's id is made on the device."""

    id: UUID
    type: Literal["add_shop"]
    shop_id: UUID
    name: ShopName


class Place(BaseModel):
    """Teaches a shop where an item goes: straight after the item named after, or at the start with none."""

    id: UUID
    type: Literal["place"]
    shop_id: UUID
    name: ItemText
    after: ItemText | None = None


ItemOperation = Add | Tick | Untick | Rename | Remove
ShopOperation = AddShop | Place
Operation = Annotated[ItemOperation | ShopOperation, Field(discriminator="type")]


class Operations(BaseModel):
    operations: Annotated[list[Operation], Field(min_length=1, max_length=MOST_OPERATIONS)]


class Applied(BaseModel):
    """What happened to one operation: its sequence number, and whether it changed the list. Sending the same
    operation again gets the same answer."""

    id: UUID
    seq: int
    changed: bool


class Item(BaseModel):
    """An item as it is now. A removed item is a marker: devices drop it."""

    id: UUID
    text: str
    ticked_off: bool
    ticked_off_at: datetime | None
    removed: bool
    # The sequence number of the last operation that changed it.
    seq: int
    # The sequence number it was added at, which devices order the list by, newest first. Items stored before
    # it was kept use their seq.
    added_seq: int


class Placed(BaseModel):
    """A name in a shop's order, and the sequence number it was last placed at."""

    name: str
    seq: int


class Shop(BaseModel):
    id: UUID
    name: str
    # Matched item names, first to last in the shop's walking order.
    order: list[Placed]
    # The sequence number of the last operation that changed it.
    seq: int


class ShopShown(BaseModel):
    """A shop as devices get it: the names in its order, without when each was placed."""

    id: UUID
    name: str
    order: list[str]
    seq: int


def match_name(text: str) -> str:
    """The form item names are matched in, so "Milk", " milk " and "Milk." are one name. Plurals aren't
    merged: "apple" and "apples" are two. Recent items (#15) match names the same way."""
    return " ".join(text.lower().split()).rstrip(string.punctuation).rstrip()


class Busy(Exception):
    """Other requests kept writing first, so an operation couldn't be applied."""


class Clash(Exception):
    """A write was refused because something it depends on changed, or was made, since it was read."""


@dataclass(frozen=True)
class Write:
    """One document to write. With no etag it must not exist yet; with one, it must be unchanged since it
    was read."""

    doc: dict[str, Any]
    etag: str | None


class Partition(Protocol):
    """One list's documents."""

    def read(self, doc_id: str) -> dict[str, Any] | None:
        """The document, with its etag as _etag, or None."""
        ...

    def commit(self, writes: Sequence[Write]) -> None:
        """Writes all of them, or none and raises Clash."""
        ...

    def items(self, after: int, ticked_off_since: str) -> list[dict[str, Any]]:
        """At least every item changed after sequence number after. With after=0, it may leave out removed
        items and items ticked off before ticked_off_since."""
        ...

    def shops(self, after: int) -> list[dict[str, Any]]:
        """At least every shop changed after sequence number after."""
        ...


class Store(Protocol):
    def partition(self, list_id: str) -> Partition: ...


def apply(item: Item | None, operation: ItemOperation, now: datetime) -> Item | None:
    """The item's new state after the operation, or None if it changes nothing. The new state's seq, and an
    added item's added_seq, are left for the caller to set."""
    if isinstance(operation, Add):
        # An item id already used, even by a removed item, isn't added again.
        if item is not None:
            return None
        return Item(
            id=operation.item_id,
            text=operation.text,
            ticked_off=False,
            ticked_off_at=None,
            removed=False,
            seq=0,
            added_seq=0,
        )
    # Removing beats anything else: an item removed at home doesn't come back if it's ticked in the shop.
    if item is None or item.removed:
        return None
    # Ticking off and the text are separate fields, so changing one never undoes the other.
    match operation:
        case Tick() if not item.ticked_off:
            return item.model_copy(update={"ticked_off": True, "ticked_off_at": now})
        case Untick() if item.ticked_off:
            return item.model_copy(update={"ticked_off": False, "ticked_off_at": None})
        case Rename() if operation.text != item.text:
            return item.model_copy(update={"text": operation.text})
        case Remove():
            return item.model_copy(update={"removed": True})
    return None


def apply_to_shop(shop: Shop | None, operation: ShopOperation, seq: int) -> Shop | None:
    """The shop's new state after the operation, at sequence number seq, or None if it changes nothing."""
    if isinstance(operation, AddShop):
        # A shop id already used isn't added again.
        if shop is not None:
            return None
        return Shop(id=operation.shop_id, name=operation.name, order=[], seq=seq)
    if shop is None:
        return None
    name = match_name(operation.name)
    after = match_name(operation.after) if operation.after is not None else None
    # A name that's all punctuation matches nothing, and a name can't follow itself.
    if not name or name == after:
        return None
    order = [placed for placed in shop.order if placed.name != name]
    names = [placed.name for placed in order]
    # Straight after the item it follows, or at the start if that isn't in the shop's order yet.
    at = names.index(after) + 1 if after in names else 0
    order.insert(at, Placed(name=name, seq=seq))
    if len(order) > MOST_PLACED:
        order.remove(min(order, key=lambda placed: placed.seq))
    if [placed.name for placed in order] == [placed.name for placed in shop.order]:
        return None
    return shop.model_copy(update={"order": order, "seq": seq})


def shown(item: Item, now: datetime) -> bool:
    """Whether a device starting from nothing needs the item: still to get, or ticked off recently."""
    if item.removed:
        return False
    if not item.ticked_off:
        return True
    return item.ticked_off_at is not None and item.ticked_off_at > now - TICKED_OFF_SHOWN_FOR


@dataclass(frozen=True)
class CaughtUp:
    items: list[Item]
    shops: list[ShopShown]
    # Ask for everything after this next time. Items changed after it may be included, and come again.
    seq: int


class Lists:
    """Applies operations to a list, and says what changed."""

    def __init__(self, store: Store, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._store = store
        self._clock = clock

    def apply(
        self, list_id: str, operations: Sequence[Operation], by: str, changes: list[int] | None = None
    ) -> list[Applied]:
        """Applies the operations in order. by is who sent them: a Member's id, or hub. The sequence number of
        each operation that changed the list in this call, not one sent before, is added to changes as soon as
        it's saved, so a batch that fails partway still says what it changed."""
        partition = self._store.partition(list_id)
        results = []
        for operation in operations:
            applied, fresh = self._apply_one(partition, list_id, operation, by)
            if fresh and applied.changed and changes is not None:
                changes.append(applied.seq)
            results.append(applied)
        return results

    def _apply_one(
        self, partition: Partition, list_id: str, operation: Operation, by: str
    ) -> tuple[Applied, bool]:
        """What happened, and whether it happened now rather than when the operation was first sent."""
        for _ in range(ATTEMPTS):
            # Sent before: the same answer as the first time.
            logged = partition.read(_operation_key(operation.id))
            if logged is not None:
                return Applied(id=operation.id, seq=logged["seq"], changed=logged["changed"]), False

            counter = partition.read(_COUNTER)
            seq = (counter["seq"] if counter is not None else 0) + 1
            now = self._clock()
            if isinstance(operation, AddShop | Place):
                stored = partition.read(_shop_key(operation.shop_id))
                shop = apply_to_shop(_shop_from(stored) if stored is not None else None, operation, seq)
                changed = shop is not None
                logged_doc = _shop_operation_doc(list_id, operation, seq, now, by, changed)
                new_doc = _shop_doc(list_id, shop, stored, now, by) if shop is not None else None
            else:
                stored = partition.read(_item_key(operation.item_id))
                item = _item_from(stored) if stored is not None else None
                new = apply(item, operation, now)
                if new is not None:
                    new = new.model_copy(update={"seq": seq, "added_seq": item.added_seq if item else seq})
                changed = new is not None
                logged_doc = _operation_doc(list_id, operation, seq, now, by, new or item, changed)
                new_doc = _item_doc(list_id, new, stored, now, by) if new is not None else None

            writes = [
                Write(
                    {"id": _COUNTER, "listId": list_id, "kind": "counter", "seq": seq},
                    _etag(counter),
                ),
                Write(logged_doc, None),
            ]
            if new_doc is not None:
                writes.append(Write(new_doc, _etag(stored)))
            try:
                partition.commit(writes)
            except Clash:
                continue
            return Applied(id=operation.id, seq=seq, changed=changed), True
        raise Busy

    def changed_since(self, list_id: str, after: int) -> CaughtUp:
        """Every item and shop changed after sequence number after. From 0, only the items a device needs,
        and every shop."""
        partition = self._store.partition(list_id)
        now = self._clock()
        # The counter is read first. Every operation up to it has been written by then, so the items read next
        # include them, and nothing is missed by asking for everything after it next time.
        counter = partition.read(_COUNTER)
        seq = counter["seq"] if counter is not None else 0
        ticked_off_since = _timestamp(now - TICKED_OFF_SHOWN_FOR)
        items = [_item_from(doc) for doc in partition.items(after, ticked_off_since)]
        items = [item for item in items if item.seq > after and (after > 0 or shown(item, now))]
        shops = [_shop_from(doc) for doc in partition.shops(after)]
        shown_shops = [
            ShopShown(id=shop.id, name=shop.name, order=[placed.name for placed in shop.order], seq=shop.seq)
            for shop in sorted(shops, key=lambda shop: shop.seq)
            if shop.seq > after
        ]
        return CaughtUp(items=sorted(items, key=lambda item: item.seq), shops=shown_shops, seq=seq)


# Documents in a list's partition: one counter, an item per item, and the log of operations. Ids are prefixed,
# as items and operations are named by ids made on devices.
_COUNTER = "counter"


def _item_key(item_id: UUID) -> str:
    return f"item-{item_id}"


def _shop_key(shop_id: UUID) -> str:
    return f"shop-{shop_id}"


def _operation_key(operation_id: UUID) -> str:
    return f"op-{operation_id}"


def _etag(doc: dict[str, Any] | None) -> str | None:
    return doc["_etag"] if doc is not None else None


def _timestamp(moment: datetime) -> str:
    """A UTC time in one fixed format, so they compare as text in Cosmos DB's queries."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _item_from(doc: dict[str, Any]) -> Item:
    ticked_off_at = doc.get("tickedOffAt")
    return Item(
        id=UUID(doc["itemId"]),
        text=doc["text"],
        ticked_off=doc["tickedOff"],
        ticked_off_at=datetime.fromisoformat(ticked_off_at) if ticked_off_at else None,
        removed=doc["removed"],
        seq=doc["seq"],
        added_seq=doc.get("addedSeq", doc["seq"]),
    )


def _item_doc(
    list_id: str, item: Item, stored: dict[str, Any] | None, now: datetime, by: str
) -> dict[str, Any]:
    # Who added it, and when, are kept from the add.
    added = {"addedAt": stored["addedAt"], "addedBy": stored["addedBy"]} if stored else {}
    return {
        "id": _item_key(item.id),
        "listId": list_id,
        "kind": "item",
        "itemId": str(item.id),
        "text": item.text,
        "tickedOff": item.ticked_off,
        "tickedOffAt": _timestamp(item.ticked_off_at) if item.ticked_off_at else None,
        "removed": item.removed,
        "seq": item.seq,
        "addedSeq": item.added_seq,
        "addedAt": _timestamp(now),
        "addedBy": by,
    } | added


def _operation_doc(
    list_id: str, operation: ItemOperation, seq: int, now: datetime, by: str, item: Item | None, changed: bool
) -> dict[str, Any]:
    """The operation in the log. It keeps the item's text as it was after the operation, so recent items (#15)
    can count what was bought without reading every item."""
    return {
        "id": _operation_key(operation.id),
        "listId": list_id,
        "kind": "op",
        "opId": str(operation.id),
        "type": operation.type,
        "itemId": str(operation.item_id),
        "text": item.text if item is not None else None,
        "seq": seq,
        "changed": changed,
        "at": _timestamp(now),
        "sentBy": by,
    }


def _shop_from(doc: dict[str, Any]) -> Shop:
    return Shop(
        id=UUID(doc["shopId"]),
        name=doc["name"],
        order=[Placed(name=placed["name"], seq=placed["seq"]) for placed in doc["order"]],
        seq=doc["seq"],
    )


def _shop_doc(
    list_id: str, shop: Shop, stored: dict[str, Any] | None, now: datetime, by: str
) -> dict[str, Any]:
    # Who added it, and when, are kept from the add.
    added = {"addedAt": stored["addedAt"], "addedBy": stored["addedBy"]} if stored else {}
    return {
        "id": _shop_key(shop.id),
        "listId": list_id,
        "kind": "shop",
        "shopId": str(shop.id),
        "name": shop.name,
        "order": [{"name": placed.name, "seq": placed.seq} for placed in shop.order],
        "seq": shop.seq,
        "addedAt": _timestamp(now),
        "addedBy": by,
    } | added


def _shop_operation_doc(
    list_id: str, operation: ShopOperation, seq: int, now: datetime, by: str, changed: bool
) -> dict[str, Any]:
    """A shop's operation in the log, with the shop's name for an add, and the names as sent for a place."""
    names = (
        {"name": operation.name}
        if isinstance(operation, AddShop)
        else {"name": operation.name, "after": operation.after}
    )
    return {
        "id": _operation_key(operation.id),
        "listId": list_id,
        "kind": "op",
        "opId": str(operation.id),
        "type": operation.type,
        "shopId": str(operation.shop_id),
        "seq": seq,
        "changed": changed,
        "at": _timestamp(now),
        "sentBy": by,
    } | names

"""The shared lists: the operations that change them, the log that keeps them in order, and the catch-up that
tells a device what changed since it last looked (design/family-app/notes.md, How sync works).

Every change is an operation with an id made on the device, and every item's id is made on the device too, so
an item added offline needs no id swapping. The server applies operations in the order they arrive, gives each
the list's next sequence number, and decides how they merge. Clients never merge: they send operations, and
show the items' states the catch-up returns.

Each list is one partition. Applying an operation reads the list's counter and the item, works out the item's
new state, then writes the counter, the operation and the item together, or not at all. If another request
wrote first, the write is refused and the operation is tried again from the start.
"""

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

ItemText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


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


Operation = Annotated[Add | Tick | Untick | Rename | Remove, Field(discriminator="type")]


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


class Store(Protocol):
    def partition(self, list_id: str) -> Partition: ...


def apply(item: Item | None, operation: Operation, now: datetime) -> Item | None:
    """The item's new state after the operation, or None if it changes nothing. The new state's seq is left
    for the caller to set."""
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
    # Ask for everything after this next time. Items changed after it may be included, and come again.
    seq: int


class Lists:
    """Applies operations to a list, and says what changed."""

    def __init__(self, store: Store, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._store = store
        self._clock = clock

    def apply(self, list_id: str, operations: Sequence[Operation], by: str) -> list[Applied]:
        """Applies the operations in order. by is who sent them: a Member's id, or hub."""
        partition = self._store.partition(list_id)
        return [self._apply_one(partition, list_id, operation, by) for operation in operations]

    def _apply_one(self, partition: Partition, list_id: str, operation: Operation, by: str) -> Applied:
        for _ in range(ATTEMPTS):
            # Sent before: the same answer as the first time.
            logged = partition.read(_operation_key(operation.id))
            if logged is not None:
                return Applied(id=operation.id, seq=logged["seq"], changed=logged["changed"])

            counter = partition.read(_COUNTER)
            stored = partition.read(_item_key(operation.item_id))
            item = _item_from(stored) if stored is not None else None
            seq = (counter["seq"] if counter is not None else 0) + 1
            now = self._clock()
            new = apply(item, operation, now)
            if new is not None:
                new = new.model_copy(update={"seq": seq})

            writes = [
                Write(
                    {"id": _COUNTER, "listId": list_id, "kind": "counter", "seq": seq},
                    _etag(counter),
                ),
                Write(_operation_doc(list_id, operation, seq, now, by, new or item, new is not None), None),
            ]
            if new is not None:
                writes.append(Write(_item_doc(list_id, new, stored, now, by), _etag(stored)))
            try:
                partition.commit(writes)
            except Clash:
                continue
            return Applied(id=operation.id, seq=seq, changed=new is not None)
        raise Busy

    def changed_since(self, list_id: str, after: int) -> CaughtUp:
        """Every item changed after sequence number after. From 0, only the items a device needs."""
        partition = self._store.partition(list_id)
        now = self._clock()
        # The counter is read first. Every operation up to it has been written by then, so the items read next
        # include them, and nothing is missed by asking for everything after it next time.
        counter = partition.read(_COUNTER)
        seq = counter["seq"] if counter is not None else 0
        ticked_off_since = _timestamp(now - TICKED_OFF_SHOWN_FOR)
        items = [_item_from(doc) for doc in partition.items(after, ticked_off_since)]
        items = [item for item in items if item.seq > after and (after > 0 or shown(item, now))]
        return CaughtUp(items=sorted(items, key=lambda item: item.seq), seq=seq)


# Documents in a list's partition: one counter, an item per item, and the log of operations. Ids are prefixed,
# as items and operations are named by ids made on devices.
_COUNTER = "counter"


def _item_key(item_id: UUID) -> str:
    return f"item-{item_id}"


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
        "addedAt": _timestamp(now),
        "addedBy": by,
    } | added


def _operation_doc(
    list_id: str, operation: Operation, seq: int, now: datetime, by: str, item: Item | None, changed: bool
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
        "by": by,
    }

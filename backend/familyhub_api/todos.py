"""The family's To-dos (#118, slice 6), kept like the Shopping list: changed by operations with ids made on
the device, applied in order with the next sequence number, and logged, in the todos partition of the lists
container (listId todos).

A To-do has its text and, if it has one, a due date: the Household's local date, as YYYY-MM-DD, which the
server never interprets. To-dos are one shared list, not assigned to anyone. Ticking off, the text and the due
date are separate fields, so changing one never undoes another; otherwise the latest to arrive wins. Removing
beats anything later: a removed To-do never comes back.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from familyhub_api.lists import (
    ATTEMPTS,
    MOST_OPERATIONS,
    TICKED_OFF_SHOWN_FOR,
    Applied,
    Busy,
    Clash,
    ItemText,
    Write,
)
from familyhub_api.meals import PlanDate

TODOS = "todos"

DueDate = PlanDate


class _TodoOperation(BaseModel):
    id: UUID
    todo_id: UUID


class AddTodo(_TodoOperation):
    type: Literal["add_todo"]
    text: ItemText
    due: DueDate | None = None


class EditTodo(_TodoOperation):
    """Changes the text, the due date, or both. A due date sent as null takes the date off; one left out
    keeps it."""

    type: Literal["edit_todo"]
    text: ItemText | None = None
    due: DueDate | None = None

    @model_validator(mode="after")
    def _changes_something(self) -> "EditTodo":
        if self.text is None and "due" not in self.model_fields_set:
            raise ValueError("an edit needs a text, a due date or both")
        return self


class TickTodo(_TodoOperation):
    type: Literal["tick"]


class UntickTodo(_TodoOperation):
    type: Literal["untick"]


class RemoveTodo(_TodoOperation):
    type: Literal["remove"]


TodoOperation = Annotated[
    AddTodo | EditTodo | TickTodo | UntickTodo | RemoveTodo, Field(discriminator="type")
]


class TodoOperations(BaseModel):
    operations: Annotated[list[TodoOperation], Field(min_length=1, max_length=MOST_OPERATIONS)]


class Todo(BaseModel):
    """A To-do as it is now. A removed To-do is a marker: devices drop it."""

    id: UUID
    text: str
    due: str | None
    ticked_off: bool
    ticked_off_at: datetime | None
    removed: bool
    # The sequence number of the last operation that changed it.
    seq: int


@dataclass(frozen=True)
class TodosCaughtUp:
    todos: list[Todo]
    # Ask for everything after this next time.
    seq: int


class TodosPartition(Protocol):
    """The todos partition's documents."""

    def read(self, doc_id: str) -> dict[str, Any] | None:
        """The document, with its etag as _etag, or None."""
        ...

    def commit(self, writes: Sequence[Write]) -> None:
        """Writes all of them, or none and raises Clash."""
        ...

    def todos(self, after: int, ticked_off_since: str) -> list[dict[str, Any]]:
        """At least every To-do changed after sequence number after. With after=0, it may leave out removed
        To-dos and those ticked off before ticked_off_since."""
        ...


class TodosStore(Protocol):
    def partition(self, list_id: str) -> TodosPartition: ...


def apply_to_todo(todo: Todo | None, operation: TodoOperation, seq: int, now: datetime) -> Todo | None:
    """The To-do's new state at sequence number seq, or None if the operation changes nothing."""
    if isinstance(operation, AddTodo):
        # A To-do id already used, even by a removed To-do, isn't added again.
        if todo is not None:
            return None
        return Todo(
            id=operation.todo_id,
            text=operation.text,
            due=operation.due,
            ticked_off=False,
            ticked_off_at=None,
            removed=False,
            seq=seq,
        )
    if todo is None or todo.removed:
        return None
    match operation:
        case TickTodo() if not todo.ticked_off:
            return todo.model_copy(update={"ticked_off": True, "ticked_off_at": now, "seq": seq})
        case UntickTodo() if todo.ticked_off:
            return todo.model_copy(update={"ticked_off": False, "ticked_off_at": None, "seq": seq})
        case RemoveTodo():
            return todo.model_copy(update={"removed": True, "seq": seq})
        case EditTodo():
            text = operation.text if operation.text is not None else todo.text
            due = operation.due if "due" in operation.model_fields_set else todo.due
            if text != todo.text or due != todo.due:
                return todo.model_copy(update={"text": text, "due": due, "seq": seq})
    return None


def shown(todo: Todo, now: datetime) -> bool:
    """Whether a device starting from nothing needs the To-do: not done, or ticked off recently."""
    if todo.removed:
        return False
    if not todo.ticked_off:
        return True
    return todo.ticked_off_at is not None and todo.ticked_off_at > now - TICKED_OFF_SHOWN_FOR


class Todos:
    """Applies operations to the To-dos, and says what changed."""

    def __init__(self, store: TodosStore, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._store = store
        self._clock = clock

    def apply(
        self, operations: Sequence[TodoOperation], by: str, changes: list[int] | None = None
    ) -> list[Applied]:
        """Applies the operations in order. by is who sent them: a Member's id, or hub. The sequence number of
        each operation that changed something in this call is added to changes as soon as it's saved."""
        partition = self._store.partition(TODOS)
        results = []
        for operation in operations:
            applied, fresh = self._apply_one(partition, operation, by)
            if fresh and applied.changed and changes is not None:
                changes.append(applied.seq)
            results.append(applied)
        return results

    def _apply_one(
        self, partition: TodosPartition, operation: TodoOperation, by: str
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
            stored = partition.read(_todo_key(operation.todo_id))
            new = apply_to_todo(_todo_from(stored) if stored else None, operation, seq, now)
            changed = new is not None

            writes = [
                Write({"id": _COUNTER, "listId": TODOS, "kind": "counter", "seq": seq}, _etag(counter)),
                Write(_operation_doc(operation, seq, now, by, changed), None),
            ]
            if new is not None:
                writes.append(Write(_todo_doc(new, stored, now, by), _etag(stored)))
            try:
                partition.commit(writes)
            except Clash:
                continue
            return Applied(id=operation.id, seq=seq, changed=changed), True
        raise Busy

    def changed_since(self, after: int) -> TodosCaughtUp:
        """Every To-do changed after sequence number after. From 0, the To-dos not done, and those ticked off
        in the last 10 minutes."""
        partition = self._store.partition(TODOS)
        now = self._clock()
        # The counter is read first, so nothing written up to it is missed by asking for everything after it.
        counter = partition.read(_COUNTER)
        seq = counter["seq"] if counter is not None else 0
        todos = [_todo_from(doc) for doc in partition.todos(after, _timestamp(now - TICKED_OFF_SHOWN_FOR))]
        return TodosCaughtUp(
            todos=sorted(
                (t for t in todos if t.seq > after and (after > 0 or shown(t, now))), key=lambda t: t.seq
            ),
            seq=seq,
        )


# Documents in the todos partition: one counter, a To-do per To-do, and the log of operations.
_COUNTER = "counter"


def _todo_key(todo_id: UUID) -> str:
    return f"todo-{todo_id}"


def _operation_key(operation_id: UUID) -> str:
    return f"op-{operation_id}"


def _etag(doc: dict[str, Any] | None) -> str | None:
    return doc["_etag"] if doc is not None else None


def _timestamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _todo_from(doc: dict[str, Any]) -> Todo:
    ticked_off_at = doc.get("tickedOffAt")
    return Todo(
        id=UUID(doc["todoId"]),
        text=doc["text"],
        due=doc["due"],
        ticked_off=doc["tickedOff"],
        ticked_off_at=datetime.fromisoformat(ticked_off_at) if ticked_off_at else None,
        removed=doc["removed"],
        seq=doc["seq"],
    )


def _todo_doc(todo: Todo, stored: dict[str, Any] | None, now: datetime, by: str) -> dict[str, Any]:
    # Who added it, and when, are kept from the add.
    added = {"addedAt": stored["addedAt"], "addedBy": stored["addedBy"]} if stored else {}
    return {
        "id": _todo_key(todo.id),
        "listId": TODOS,
        "kind": "todo",
        "todoId": str(todo.id),
        "text": todo.text,
        "due": todo.due,
        "tickedOff": todo.ticked_off,
        "tickedOffAt": _timestamp(todo.ticked_off_at) if todo.ticked_off_at else None,
        "removed": todo.removed,
        "seq": todo.seq,
        "addedAt": _timestamp(now),
        "addedBy": by,
    } | added


def _operation_doc(
    operation: TodoOperation, seq: int, now: datetime, by: str, changed: bool
) -> dict[str, Any]:
    """The operation in the log, with what it carried. An edit's due date is kept even when it's null, as
    that took the date off."""
    return {
        "id": _operation_key(operation.id),
        "listId": TODOS,
        "kind": "op",
        "opId": str(operation.id),
        "seq": seq,
        "changed": changed,
        "at": _timestamp(now),
        "sentBy": by,
    } | operation.model_dump(mode="json", exclude={"id"}, exclude_unset=True)

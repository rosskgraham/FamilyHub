"""Saved meals and the dinner plan (#97, ADR 0017), kept like the shared lists: changed by operations with
ids made on the device, applied in order with the next sequence number, and logged, in the meals partition of
the lists container (listId meals).

A meal has a name and its ingredients, in order. The plan is one meal per date: the Household's local date,
as YYYY-MM-DD, which the server never interprets. Planning a date again replaces its meal. Removing a meal
leaves any plan day that names it pointing at a removed meal, which devices show as empty. Past plan days are
kept.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal, Protocol
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, model_validator

from familyhub_api.lists import ATTEMPTS, MOST_OPERATIONS, Applied, Busy, Clash, ItemText, Write

MEALS = "meals"

# The most ingredients a meal can have.
MOST_INGREDIENTS = 50


def _a_date(text: str) -> str:
    """A real date written YYYY-MM-DD, kept as written."""
    if len(text) != 10 or date.fromisoformat(text).isoformat() != text:
        raise ValueError("a date written YYYY-MM-DD")
    return text


PlanDate = Annotated[str, AfterValidator(_a_date)]
Ingredients = Annotated[list[ItemText], Field(max_length=MOST_INGREDIENTS)]


class AddMeal(BaseModel):
    id: UUID
    type: Literal["add_meal"]
    meal_id: UUID
    name: ItemText
    ingredients: Ingredients = []


class EditMeal(BaseModel):
    """Replaces the name, the whole ingredient list, or both."""

    id: UUID
    type: Literal["edit_meal"]
    meal_id: UUID
    name: ItemText | None = None
    ingredients: Ingredients | None = None

    @model_validator(mode="after")
    def _changes_something(self) -> "EditMeal":
        if self.name is None and self.ingredients is None:
            raise ValueError("an edit needs a name, ingredients or both")
        return self


class RemoveMeal(BaseModel):
    id: UUID
    type: Literal["remove_meal"]
    meal_id: UUID


class Plan(BaseModel):
    """Plans a saved meal for a date, replacing whatever was planned."""

    id: UUID
    type: Literal["plan"]
    date: PlanDate
    meal_id: UUID


class Unplan(BaseModel):
    id: UUID
    type: Literal["unplan"]
    date: PlanDate


MealOperation = Annotated[AddMeal | EditMeal | RemoveMeal | Plan | Unplan, Field(discriminator="type")]


class MealOperations(BaseModel):
    operations: Annotated[list[MealOperation], Field(min_length=1, max_length=MOST_OPERATIONS)]


class Meal(BaseModel):
    """A meal as it is now. A removed meal is a marker: devices drop it."""

    id: UUID
    name: str
    ingredients: list[str]
    removed: bool
    # The sequence number of the last operation that changed it.
    seq: int


class PlanDay(BaseModel):
    """A date's dinner: a meal's id, or None once unplanned."""

    date: str
    meal_id: UUID | None
    seq: int


@dataclass(frozen=True)
class MealsCaughtUp:
    meals: list[Meal]
    plan: list[PlanDay]
    # Ask for everything after this next time.
    seq: int


class UnknownMeal(Exception):
    """A plan named a meal that was never added."""

    def __init__(self, meal_id: UUID) -> None:
        super().__init__(f"No meal {meal_id} has been added.")
        self.meal_id = meal_id


class MealsPartition(Protocol):
    """The meals partition's documents."""

    def read(self, doc_id: str) -> dict[str, Any] | None:
        """The document, with its etag as _etag, or None."""
        ...

    def commit(self, writes: Sequence[Write]) -> None:
        """Writes all of them, or none and raises Clash."""
        ...

    def changed(self, kind: str, after: int) -> list[dict[str, Any]]:
        """At least every document of the kind changed after sequence number after."""
        ...


class MealsStore(Protocol):
    def partition(self, list_id: str) -> MealsPartition: ...


def apply_to_meal(meal: Meal | None, operation: AddMeal | EditMeal | RemoveMeal, seq: int) -> Meal | None:
    """The meal's new state at sequence number seq, or None if the operation changes nothing."""
    if isinstance(operation, AddMeal):
        # A meal id already used, even by a removed meal, isn't added again.
        if meal is not None:
            return None
        return Meal(
            id=operation.meal_id,
            name=operation.name,
            ingredients=operation.ingredients,
            removed=False,
            seq=seq,
        )
    if meal is None or meal.removed:
        return None
    if isinstance(operation, RemoveMeal):
        return meal.model_copy(update={"removed": True, "seq": seq})
    name = operation.name if operation.name is not None else meal.name
    ingredients = operation.ingredients if operation.ingredients is not None else meal.ingredients
    if name == meal.name and ingredients == meal.ingredients:
        return None
    return meal.model_copy(update={"name": name, "ingredients": ingredients, "seq": seq})


def apply_to_day(day: PlanDay | None, operation: Plan | Unplan, seq: int) -> PlanDay | None:
    """The plan day's new state at sequence number seq, or None if the operation changes nothing."""
    meal_id = operation.meal_id if isinstance(operation, Plan) else None
    if (day.meal_id if day is not None else None) == meal_id:
        return None
    return PlanDay(date=operation.date, meal_id=meal_id, seq=seq)


class Meals:
    """Applies operations to the meals and the plan, and says what changed."""

    def __init__(self, store: MealsStore, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._store = store
        self._clock = clock

    def apply(
        self, operations: Sequence[MealOperation], by: str, changes: list[int] | None = None
    ) -> list[Applied]:
        """Applies the operations in order. by is who sent them: a Member's id, or hub. Before any is applied,
        a plan naming a meal that was never added, here or earlier in the batch, raises UnknownMeal, so a bad
        batch changes nothing. The sequence number of each operation that changed something in this call is
        added to changes as soon as it's saved."""
        partition = self._store.partition(MEALS)
        added = {op.meal_id for op in operations if isinstance(op, AddMeal)}
        for op in operations:
            if (
                isinstance(op, Plan)
                and op.meal_id not in added
                and partition.read(_meal_key(op.meal_id)) is None
            ):
                raise UnknownMeal(op.meal_id)
        results = []
        for operation in operations:
            applied, fresh = self._apply_one(partition, operation, by)
            if fresh and applied.changed and changes is not None:
                changes.append(applied.seq)
            results.append(applied)
        return results

    def _apply_one(
        self, partition: MealsPartition, operation: MealOperation, by: str
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
            if isinstance(operation, Plan | Unplan):
                key = _plan_key(operation.date)
                stored = partition.read(key)
                new_day = apply_to_day(_day_from(stored) if stored else None, operation, seq)
                changed = new_day is not None
                new_doc = _day_doc(new_day, stored, now, by) if new_day is not None else None
            else:
                key = _meal_key(operation.meal_id)
                stored = partition.read(key)
                new_meal = apply_to_meal(_meal_from(stored) if stored else None, operation, seq)
                changed = new_meal is not None
                new_doc = _meal_doc(new_meal, stored, now, by) if new_meal is not None else None

            writes = [
                Write({"id": _COUNTER, "listId": MEALS, "kind": "counter", "seq": seq}, _etag(counter)),
                Write(_operation_doc(operation, seq, now, by, changed), None),
            ]
            if new_doc is not None:
                writes.append(Write(new_doc, _etag(stored)))
            try:
                partition.commit(writes)
            except Clash:
                continue
            return Applied(id=operation.id, seq=seq, changed=changed), True
        raise Busy

    def changed_since(self, after: int) -> MealsCaughtUp:
        """Every meal and plan day changed after sequence number after. From 0, the meals not removed and the
        days with a meal planned."""
        partition = self._store.partition(MEALS)
        # The counter is read first, so nothing written up to it is missed by asking for everything after it.
        counter = partition.read(_COUNTER)
        seq = counter["seq"] if counter is not None else 0
        meals = [_meal_from(doc) for doc in partition.changed("meal", after)]
        days = [_day_from(doc) for doc in partition.changed("plan", after)]
        return MealsCaughtUp(
            meals=sorted(
                (m for m in meals if m.seq > after and (after > 0 or not m.removed)), key=lambda m: m.seq
            ),
            plan=sorted(
                (d for d in days if d.seq > after and (after > 0 or d.meal_id is not None)),
                key=lambda d: d.date,
            ),
            seq=seq,
        )


# Documents in the meals partition: one counter, a meal per meal, a plan day per date, and the log of
# operations.
_COUNTER = "counter"


def _meal_key(meal_id: UUID) -> str:
    return f"meal-{meal_id}"


def _plan_key(day: str) -> str:
    return f"plan-{day}"


def _operation_key(operation_id: UUID) -> str:
    return f"op-{operation_id}"


def _etag(doc: dict[str, Any] | None) -> str | None:
    return doc["_etag"] if doc is not None else None


def _timestamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _meal_from(doc: dict[str, Any]) -> Meal:
    return Meal(
        id=UUID(doc["mealId"]),
        name=doc["name"],
        ingredients=doc["ingredients"],
        removed=doc["removed"],
        seq=doc["seq"],
    )


def _meal_doc(meal: Meal, stored: dict[str, Any] | None, now: datetime, by: str) -> dict[str, Any]:
    # Who added it, and when, are kept from the add.
    added = {"addedAt": stored["addedAt"], "addedBy": stored["addedBy"]} if stored else {}
    return {
        "id": _meal_key(meal.id),
        "listId": MEALS,
        "kind": "meal",
        "mealId": str(meal.id),
        "name": meal.name,
        "ingredients": meal.ingredients,
        "removed": meal.removed,
        "seq": meal.seq,
        "addedAt": _timestamp(now),
        "addedBy": by,
    } | added


def _day_from(doc: dict[str, Any]) -> PlanDay:
    return PlanDay(date=doc["date"], meal_id=UUID(doc["mealId"]) if doc["mealId"] else None, seq=doc["seq"])


def _day_doc(day: PlanDay, stored: dict[str, Any] | None, now: datetime, by: str) -> dict[str, Any]:
    return {
        "id": _plan_key(day.date),
        "listId": MEALS,
        "kind": "plan",
        "date": day.date,
        "mealId": str(day.meal_id) if day.meal_id else None,
        "seq": day.seq,
        "changedAt": _timestamp(now),
        "changedBy": by,
    }


def _operation_doc(
    operation: MealOperation, seq: int, now: datetime, by: str, changed: bool
) -> dict[str, Any]:
    """The operation in the log, with what it carried."""
    return {
        "id": _operation_key(operation.id),
        "listId": MEALS,
        "kind": "op",
        "opId": str(operation.id),
        "seq": seq,
        "changed": changed,
        "at": _timestamp(now),
        "sentBy": by,
    } | operation.model_dump(mode="json", exclude={"id"}, exclude_none=True)

"""The Shopping list's operations, log and catch-up, through the API, with a stand-in for Cosmos DB that keeps
etags and refuses clashing writes as a transactional batch would."""

import copy
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi.testclient import TestClient
from test_sign_in import MEMBER_OID, SETTINGS, STRANGER_OID, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.lists import Clash, Write
from familyhub_api.main import create_app

START = datetime(2026, 11, 22, 9, 0, tzinfo=UTC)


class FakePartition:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}
        self._writes = 0
        # Runs once, just before the next commit, as if another request got in first.
        self.before_next_commit: Callable[[], None] | None = None
        self.always_clash = False

    def read(self, doc_id: str) -> dict[str, Any] | None:
        doc = self.docs.get(doc_id)
        return copy.deepcopy(doc) if doc is not None else None

    def commit(self, writes: Sequence[Write]) -> None:
        if self.before_next_commit is not None:
            hook, self.before_next_commit = self.before_next_commit, None
            hook()
        if self.always_clash:
            raise Clash
        for write in writes:
            current = self.docs.get(write.doc["id"])
            if write.etag is None and current is not None:
                raise Clash
            if write.etag is not None and (current is None or current["_etag"] != write.etag):
                raise Clash
        for write in writes:
            self._writes += 1
            self.docs[write.doc["id"]] = copy.deepcopy(write.doc) | {"_etag": f"etag-{self._writes}"}

    def items(self, after: int, ticked_off_since: str) -> list[dict[str, Any]]:
        # Everything: the most the store is allowed to return, so the API's own filtering is what's tested.
        return [copy.deepcopy(doc) for doc in self.docs.values() if doc["kind"] == "item"]

    def log(self) -> list[dict[str, Any]]:
        return sorted((d for d in self.docs.values() if d["kind"] == "op"), key=lambda d: d["seq"])


class FakeStore:
    def __init__(self) -> None:
        self.shopping = FakePartition()

    def partition(self, list_id: str) -> FakePartition:
        assert list_id == "shopping"
        return self.shopping


class Clock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(store: FakeStore, clock: Clock) -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return TestClient(create_app(checker=checker, accounts=accounts, store=store, clock=clock))


def send(client: TestClient, *operations: dict[str, Any], bearer: str | None = None) -> Any:
    bearer = bearer or token()
    return client.post(
        "/lists/shopping/operations",
        json={"operations": list(operations)},
        headers={"Authorization": f"Bearer {bearer}"},
    )


def items(client: TestClient, after: int = 0, bearer: str | None = None) -> Any:
    bearer = bearer or token()
    response = client.get(
        "/lists/shopping/items", params={"after": after}, headers={"Authorization": f"Bearer {bearer}"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def op(kind: str, item_id: str, text: str | None = None) -> dict[str, Any]:
    operation = {"id": str(uuid4()), "type": kind, "item_id": item_id}
    return operation | ({"text": text} if text is not None else {})


def add(text: str, item_id: str | None = None) -> dict[str, Any]:
    return op("add", item_id or str(uuid4()), text)


def test_an_added_item_is_on_the_list(client: TestClient) -> None:
    milk = add("Milk")

    response = send(client, milk)

    assert response.status_code == 200
    assert response.json() == {"results": [{"id": milk["id"], "seq": 1, "changed": True}]}
    assert items(client) == {
        "items": [
            {
                "id": milk["item_id"],
                "text": "Milk",
                "ticked_off": False,
                "ticked_off_at": None,
                "removed": False,
                "seq": 1,
            }
        ],
        "seq": 1,
    }


def test_text_is_trimmed(client: TestClient) -> None:
    send(client, add("  Bread  "))

    assert items(client)["items"][0]["text"] == "Bread"


def test_each_operation_changes_the_item_and_gets_the_next_number(
    client: TestClient, store: FakeStore, clock: Clock
) -> None:
    item_id = str(uuid4())
    operations = [
        add("Milk", item_id),
        op("tick", item_id),
        op("untick", item_id),
        op("rename", item_id, "Oat milk"),
        op("remove", item_id),
    ]

    results = []
    for operation in operations:
        clock.now += timedelta(seconds=1)
        results.append(send(client, operation).json()["results"][0])

    assert [r["seq"] for r in results] == [1, 2, 3, 4, 5]
    assert all(r["changed"] for r in results)
    assert [(d["type"], d["seq"], d["by"], d["text"]) for d in store.shopping.log()] == [
        ("add", 1, "ross", "Milk"),
        ("tick", 2, "ross", "Milk"),
        ("untick", 3, "ross", "Milk"),
        ("rename", 4, "ross", "Oat milk"),
        ("remove", 5, "ross", "Oat milk"),
    ]
    assert store.shopping.log()[1]["at"] == "2026-11-22T09:00:02.000000Z"


def test_each_step_shows_in_the_catch_up(client: TestClient) -> None:
    item_id = str(uuid4())
    send(client, add("Milk", item_id))

    send(client, op("tick", item_id))
    ticked = items(client, after=1)["items"][0]
    assert ticked["ticked_off"] is True
    assert ticked["ticked_off_at"] == "2026-11-22T09:00:00Z"

    send(client, op("untick", item_id))
    assert items(client, after=2)["items"][0] | {"seq": None} == {
        "id": item_id,
        "text": "Milk",
        "ticked_off": False,
        "ticked_off_at": None,
        "removed": False,
        "seq": None,
    }

    send(client, op("rename", item_id, "Oat milk"))
    assert items(client, after=3)["items"][0]["text"] == "Oat milk"

    send(client, op("remove", item_id))
    assert items(client, after=4)["items"][0]["removed"] is True


def test_several_operations_in_one_batch_are_applied_in_order(client: TestClient) -> None:
    item_id = str(uuid4())

    response = send(client, add("Eggs", item_id), op("tick", item_id), op("rename", item_id, "Big eggs"))

    assert [r["seq"] for r in response.json()["results"]] == [1, 2, 3]
    [eggs] = items(client, after=0)["items"]
    assert (eggs["text"], eggs["ticked_off"], eggs["seq"]) == ("Big eggs", True, 3)


def test_the_hub_can_change_the_list_and_is_logged_as_the_hub(client: TestClient, store: FakeStore) -> None:
    response = send(client, add("Milk"), bearer=hub_token())

    assert response.status_code == 200
    assert store.shopping.log()[0]["by"] == "hub"
    assert len(items(client, bearer=hub_token())["items"]) == 1


def test_sending_an_operation_again_applies_it_once(client: TestClient, store: FakeStore) -> None:
    item_id = str(uuid4())
    milk = add("Milk", item_id)
    tick = op("tick", item_id)
    send(client, milk)

    first = send(client, tick)
    send(client, op("untick", item_id))
    again = send(client, tick)

    assert first.json() == again.json() == {"results": [{"id": tick["id"], "seq": 2, "changed": True}]}
    # The tick wasn't applied a second time: the untick after it still stands.
    assert items(client)["items"][0]["ticked_off"] is False
    assert [d["type"] for d in store.shopping.log()] == ["add", "tick", "untick"]


def test_sending_an_add_again_adds_one_item(client: TestClient) -> None:
    milk = add("Milk")

    send(client, milk)
    send(client, milk)

    assert len(items(client)["items"]) == 1


@pytest.mark.parametrize(
    "late",
    [
        lambda item_id: op("tick", item_id),
        lambda item_id: op("untick", item_id),
        lambda item_id: op("rename", item_id, "Oat milk"),
        lambda item_id: op("remove", item_id),
        lambda item_id: add("Milk again", item_id),
    ],
    ids=["tick", "untick", "rename", "remove", "add"],
)
def test_nothing_brings_back_a_removed_item(
    client: TestClient, late: Callable[[str], dict[str, Any]]
) -> None:
    item_id = str(uuid4())
    send(client, add("Milk", item_id), op("remove", item_id))

    result = send(client, late(item_id)).json()["results"][0]

    assert result == {"id": result["id"], "seq": 3, "changed": False}
    [marker] = items(client, after=1)["items"]
    assert (marker["removed"], marker["text"], marker["seq"]) == (True, "Milk", 2)
    assert items(client)["items"] == []


def test_an_operation_on_an_unknown_item_changes_nothing(client: TestClient) -> None:
    result = send(client, op("tick", str(uuid4()))).json()["results"][0]

    assert result["changed"] is False
    assert items(client)["items"] == []


def test_adding_an_item_id_already_used_changes_nothing(client: TestClient) -> None:
    item_id = str(uuid4())
    send(client, add("Milk", item_id))

    result = send(client, add("Bread", item_id)).json()["results"][0]

    assert result["changed"] is False
    assert items(client)["items"][0]["text"] == "Milk"


def test_a_rename_does_not_untick_and_a_tick_does_not_undo_a_rename(client: TestClient) -> None:
    item_id = str(uuid4())
    send(client, add("Milk", item_id), op("tick", item_id), op("rename", item_id, "Oat milk"))
    renamed = items(client)["items"][0]
    assert (renamed["text"], renamed["ticked_off"]) == ("Oat milk", True)

    send(client, op("untick", item_id), op("tick", item_id))

    ticked = items(client)["items"][0]
    assert (ticked["text"], ticked["ticked_off"]) == ("Oat milk", True)


def test_a_no_change_still_gets_a_number_and_is_logged(client: TestClient, store: FakeStore) -> None:
    item_id = str(uuid4())
    send(client, add("Milk", item_id))

    result = send(client, op("untick", item_id)).json()["results"][0]

    assert (result["seq"], result["changed"]) == (2, False)
    assert [(d["type"], d["changed"]) for d in store.shopping.log()] == [("add", True), ("untick", False)]
    # The item didn't change, so it isn't in the catch-up after the add.
    assert items(client, after=1) == {"items": [], "seq": 2}


def test_the_catch_up_returns_only_what_changed_after_the_number(client: TestClient) -> None:
    milk, bread, eggs = str(uuid4()), str(uuid4()), str(uuid4())
    send(client, add("Milk", milk), add("Bread", bread), add("Eggs", eggs))

    send(client, op("tick", bread), op("remove", eggs))

    caught_up = items(client, after=3)
    assert caught_up["seq"] == 5
    assert [(i["id"], i["ticked_off"], i["removed"]) for i in caught_up["items"]] == [
        (bread, True, False),
        (eggs, False, True),
    ]
    assert items(client, after=5) == {"items": [], "seq": 5}


def test_from_nothing_removed_items_and_items_ticked_off_over_10_minutes_ago_are_left_out(
    client: TestClient, clock: Clock
) -> None:
    milk, bread, eggs, jam = str(uuid4()), str(uuid4()), str(uuid4()), str(uuid4())
    send(client, add("Milk", milk), add("Bread", bread), add("Eggs", eggs), add("Jam", jam))
    send(client, op("tick", bread))
    clock.now += timedelta(minutes=2)
    send(client, op("tick", eggs), op("remove", jam))

    clock.now += timedelta(minutes=9)

    # Bread was ticked off 11 minutes ago, eggs 9 minutes ago.
    caught_up = items(client)
    assert [i["text"] for i in caught_up["items"]] == ["Milk", "Eggs"]
    assert caught_up["seq"] == 7
    # A device that's been following along still hears about all of them.
    assert {i["id"] for i in items(client, after=4)["items"]} == {bread, eggs, jam}


def test_a_clash_on_the_counter_is_tried_again(client: TestClient, store: FakeStore) -> None:
    first, second = add("Milk"), add("Bread")
    # Just before the first batch writes, another request applies the second batch and takes number 1.
    store.shopping.before_next_commit = lambda: send(client, second)

    response = send(client, first)

    assert response.json()["results"] == [{"id": first["id"], "seq": 2, "changed": True}]
    assert [(d["opId"], d["seq"]) for d in store.shopping.log()] == [(second["id"], 1), (first["id"], 2)]
    assert {i["text"] for i in items(client)["items"]} == {"Milk", "Bread"}


def test_the_same_operation_sent_twice_at_once_is_applied_once(client: TestClient, store: FakeStore) -> None:
    milk = add("Milk")
    store.shopping.before_next_commit = lambda: send(client, milk)

    response = send(client, milk)

    assert response.json()["results"] == [{"id": milk["id"], "seq": 1, "changed": True}]
    assert len(store.shopping.log()) == 1


def test_endless_clashes_are_a_503(client: TestClient, store: FakeStore) -> None:
    store.shopping.always_clash = True

    assert send(client, add("Milk")).status_code == 503


def test_cosmos_db_failing_is_a_503(client: TestClient, store: FakeStore) -> None:
    def fail(_doc_id: str) -> None:
        raise CosmosHttpResponseError(status_code=429, message="Too many requests")

    store.shopping.read = fail  # type: ignore[method-assign]

    assert send(client, add("Milk")).status_code == 503
    assert (
        client.get("/lists/shopping/items", headers={"Authorization": f"Bearer {token()}"}).status_code == 503
    )


@pytest.mark.parametrize(
    "body",
    [
        {"operations": [add("   ")]},
        {"operations": [add("x" * 201)]},
        {"operations": [op("rename", str(uuid4()), "")]},
        {"operations": [add("Milk") | {"type": "buy"}]},
        {"operations": [add("Milk") | {"item_id": "not-a-uuid"}]},
        {"operations": [add("Milk") | {"id": "1"}]},
        {"operations": [add(f"Item {n}") for n in range(101)]},
        {"operations": []},
        {"operations": [add("Milk"), add("")]},
        {},
    ],
    ids=[
        "blank",
        "too long",
        "blank rename",
        "unknown type",
        "item id not a uuid",
        "id not a uuid",
        "101 operations",
        "none",
        "one bad of two",
        "no operations",
    ],
)
def test_a_bad_batch_is_a_422_and_nothing_is_applied(
    client: TestClient, store: FakeStore, body: dict[str, Any]
) -> None:
    response = client.post(
        "/lists/shopping/operations", json=body, headers={"Authorization": f"Bearer {token()}"}
    )

    assert response.status_code == 422
    assert store.shopping.docs == {}


def test_200_characters_and_100_operations_are_allowed(client: TestClient) -> None:
    response = send(client, add("x" * 200), *[add(f"Item {n}") for n in range(99)])

    assert response.status_code == 200
    assert len(items(client)["items"]) == 100


def test_a_negative_number_is_a_422(client: TestClient) -> None:
    response = client.get(
        "/lists/shopping/items", params={"after": -1}, headers={"Authorization": f"Bearer {token()}"}
    )

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["get", "post"])
def test_the_list_needs_sign_in(client: TestClient, store: FakeStore, method: str) -> None:
    path = "/lists/shopping/items" if method == "get" else "/lists/shopping/operations"
    body = {"json": {"operations": [add("Milk")]}} if method == "post" else {}

    no_token = client.request(method, path, **body)
    stranger = client.request(
        method, path, headers={"Authorization": f"Bearer {token(oid=STRANGER_OID)}"}, **body
    )

    assert no_token.status_code == 401
    assert stranger.status_code == 403
    assert store.shopping.docs == {}


def test_without_cosmos_db_the_list_is_a_503() -> None:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    client = TestClient(create_app(checker=checker, accounts=FakeAccounts({MEMBER_OID: "ross"}), store=None))

    response = client.get("/lists/shopping/items", headers={"Authorization": f"Bearer {token()}"})

    assert response.status_code == 503

"""Regulars (#109): the names bought most, and most recently, worked out from the Shopping list's log,
through the API, with test_lists' stand-in for Cosmos DB."""

from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_lists import Clock, FakeStore, add, op, send
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.main import create_app


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


def regulars(client: TestClient, limit: int | None = None, bearer: str | None = None) -> list[str]:
    response = get_regulars(client, limit, bearer)
    assert response.status_code == 200, response.text
    return [regular["name"] for regular in response.json()["regulars"]]


def get_regulars(client: TestClient, limit: int | None = None, bearer: str | None = None) -> Any:
    params = {"limit": limit} if limit is not None else {}
    return client.get(
        "/lists/shopping/regulars", params=params, headers={"Authorization": f"Bearer {bearer or token()}"}
    )


def dont_suggest(name: str) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "dont_suggest", "name": name}


class Shopping:
    """Buys things at the clock's time: adds an item, then ticks it off."""

    def __init__(self, client: TestClient, clock: Clock) -> None:
        self.client = client
        self.clock = clock

    def buy(self, text: str, ago: timedelta = timedelta(0)) -> str:
        item = add(text)
        now = self.clock.now
        self.clock.now = now - ago
        send(self.client, item)
        send(self.client, op("tick", item["item_id"]))
        self.clock.now = now
        return item["item_id"]


@pytest.fixture
def shopping(client: TestClient, clock: Clock) -> Shopping:
    return Shopping(client, clock)


def weeks(n: float) -> timedelta:
    return timedelta(weeks=n)


def test_items_bought_weekly_rank_above_ones_bought_once(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    for week in range(1, 7):
        shopping.buy("Milk", weeks(week))
    shopping.buy("Saffron", weeks(1))
    clock.now += timedelta(hours=1)

    assert regulars(client) == ["Milk", "Saffron"]


def test_a_purchase_counts_half_as_much_every_3_weeks(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    # Four times 9 weeks ago: 4 x 1/8 = 0.5. Twice last week: about 2 x 0.79 = 1.6.
    for _ in range(4):
        shopping.buy("Flour", weeks(9))
    for _ in range(2):
        shopping.buy("Bread", weeks(1))
    clock.now += timedelta(hours=1)

    assert regulars(client) == ["Bread", "Flour"]


def test_names_are_matched_and_shown_as_last_spelled_but_plurals_are_two(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    shopping.buy("Milk", weeks(3))
    shopping.buy(" milk", weeks(2))
    shopping.buy("Milk.", weeks(1))
    shopping.buy("apple", weeks(1))
    shopping.buy("apples", weeks(2))
    clock.now += timedelta(hours=1)

    assert regulars(client) == ["Milk.", "apple", "apples"]


def test_purchases_older_than_12_weeks_and_removed_items_don_t_count(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    shopping.buy("Turkey", weeks(13))
    removed = shopping.buy("Cake", weeks(1))
    send(client, op("remove", removed))
    shopping.buy("Eggs", weeks(1))
    clock.now += timedelta(hours=1)

    assert regulars(client) == ["Eggs"]


def test_an_item_added_then_ticked_off_counts_once(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    # Ticked off, unticked and ticked off again is still one purchase, so Butter's one beats nothing but Jam's
    # two separate items beat it.
    butter = shopping.buy("Butter", weeks(1))
    send(client, op("untick", butter))
    send(client, op("tick", butter))
    shopping.buy("Jam", weeks(1))
    shopping.buy("Jam", weeks(1))
    clock.now += timedelta(hours=1)

    assert regulars(client) == ["Jam", "Butter"]


def test_names_on_the_list_and_not_ticked_off_are_left_out(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    shopping.buy("Milk", weeks(1))
    shopping.buy("Eggs", weeks(1))
    clock.now += timedelta(hours=1)
    send(client, add("milk"))

    assert regulars(client) == ["Eggs"]


def test_names_ticked_off_in_the_last_10_minutes_are_left_out(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    shopping.buy("Milk", weeks(1))
    shopping.buy("Eggs", weeks(1))
    clock.now += timedelta(hours=1)
    shopping.buy("Milk")
    assert regulars(client) == ["Eggs"]

    clock.now += timedelta(minutes=11)
    assert regulars(client) == ["Milk", "Eggs"]


def test_dont_suggest_leaves_a_name_out_until_it_s_added_again(
    client: TestClient, shopping: Shopping, clock: Clock, store: FakeStore
) -> None:
    shopping.buy("Milk", weeks(1))
    shopping.buy("Eggs", weeks(1))
    clock.now += timedelta(hours=1)
    stop = dont_suggest("milk")

    first = send(client, stop).json()["results"]
    assert regulars(client) == ["Eggs"]

    # Sent again, it's the same answer and changes nothing.
    logged = len(store.shopping.log())
    assert send(client, stop).json()["results"] == first
    assert len(store.shopping.log()) == logged
    assert regulars(client) == ["Eggs"]

    # Another dont_suggest that's never added again stays.
    send(client, dont_suggest("Eggs"))
    assert regulars(client) == []

    shopping.buy("MILK")
    clock.now += timedelta(minutes=11)
    assert regulars(client) == ["MILK"]


def test_dont_suggest_is_kept_in_the_log_with_who_sent_it(client: TestClient, store: FakeStore) -> None:
    stop = dont_suggest("Milk")
    send(client, stop, bearer=hub_token())

    [logged] = store.shopping.log()
    assert logged | {"at": None} == {
        "id": f"op-{stop['id']}",
        "listId": "shopping",
        "kind": "op",
        "opId": stop["id"],
        "type": "dont_suggest",
        "name": "Milk",
        "seq": 1,
        "changed": True,
        "at": None,
        "sentBy": "hub",
        "_etag": logged["_etag"],
    }


def test_limit_is_respected_and_refused_above_50(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    for n in range(30):
        shopping.buy(f"Item {n:02}", weeks(1) + timedelta(hours=n))
    clock.now += timedelta(hours=1)

    assert regulars(client, limit=3) == ["Item 00", "Item 01", "Item 02"]
    assert len(regulars(client)) == 20
    assert len(regulars(client, limit=50)) == 30
    assert get_regulars(client, limit=51).status_code == 422
    assert get_regulars(client, limit=0).status_code == 422


def test_the_hub_and_members_may_ask_but_no_one_else(
    client: TestClient, shopping: Shopping, clock: Clock
) -> None:
    shopping.buy("Milk", weeks(1))
    clock.now += timedelta(hours=1)

    assert regulars(client, bearer=hub_token()) == ["Milk"]
    assert regulars(client, bearer=token()) == ["Milk"]
    assert client.get("/lists/shopping/regulars").status_code == 401


def test_nothing_bought_yet_is_an_empty_list(client: TestClient) -> None:
    assert regulars(client) == []

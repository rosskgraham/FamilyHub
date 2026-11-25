"""Shops and their learned walking order (#85), through the API, with test_lists' stand-in for Cosmos DB."""

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_lists import Clock, FakeStore, add, items, send
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts, token

from familyhub_api.auth import TokenChecker
from familyhub_api.lists import MOST_PLACED, match_name
from familyhub_api.main import create_app


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def client(store: FakeStore) -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return TestClient(create_app(checker=checker, accounts=accounts, store=store, clock=Clock()))


def add_shop(name: str, shop_id: str | None = None) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "add_shop", "shop_id": shop_id or str(uuid4()), "name": name}


def place(shop_id: str, name: str, after: str | None = None) -> dict[str, Any]:
    operation = {"id": str(uuid4()), "type": "place", "shop_id": shop_id, "name": name}
    return operation | ({"after": after} if after is not None else {})


def order(client: TestClient, shop_id: str) -> list[str]:
    [shop] = [shop for shop in items(client)["shops"] if shop["id"] == shop_id]
    return shop["order"]


@pytest.fixture
def aldi(client: TestClient) -> str:
    shop = add_shop("Aldi")
    send(client, shop)
    return shop["shop_id"]


def test_an_added_shop_is_in_the_catch_up_with_nothing_learned(client: TestClient, store: FakeStore) -> None:
    shop = add_shop("  Aldi  ")

    response = send(client, shop)

    assert response.json() == {"results": [{"id": shop["id"], "seq": 1, "changed": True}]}
    assert items(client) == {
        "items": [],
        "shops": [{"id": shop["shop_id"], "name": "Aldi", "order": [], "seq": 1}],
        "seq": 1,
    }
    [logged] = store.shopping.log()
    assert (logged["type"], logged["shopId"], logged["name"], logged["sentBy"]) == (
        "add_shop",
        shop["shop_id"],
        "Aldi",
        "ross",
    )


def test_sending_an_add_shop_again_or_reusing_its_id_changes_nothing(client: TestClient, aldi: str) -> None:
    again = send(client, add_shop("Lidl", aldi)).json()["results"][0]

    assert again["changed"] is False
    assert [(s["id"], s["name"]) for s in items(client)["shops"]] == [(aldi, "Aldi")]


@pytest.mark.parametrize("name", ["   ", "x" * 51], ids=["blank", "51 characters"])
def test_a_bad_shop_name_is_a_422(client: TestClient, store: FakeStore, name: str) -> None:
    response = client.post(
        "/lists/shopping/operations",
        json={"operations": [add_shop(name)]},
        headers={"Authorization": f"Bearer {token()}"},
    )

    assert response.status_code == 422
    assert store.shopping.docs == {}


def test_a_50_character_shop_name_is_allowed(client: TestClient) -> None:
    assert send(client, add_shop("x" * 50)).json()["results"][0]["changed"] is True


def test_placing_puts_a_name_straight_after_the_one_it_follows(client: TestClient, aldi: str) -> None:
    send(
        client,
        place(aldi, "Bananas"),
        place(aldi, "Milk", after="Bananas"),
        place(aldi, "Eggs", after="Milk"),
    )

    send(client, place(aldi, "Bread", after="Bananas"))

    assert order(client, aldi) == ["bananas", "bread", "milk", "eggs"]


def test_placing_a_name_already_there_moves_it(client: TestClient, aldi: str) -> None:
    send(
        client,
        place(aldi, "Bananas"),
        place(aldi, "Milk", after="Bananas"),
        place(aldi, "Eggs", after="Milk"),
    )

    send(client, place(aldi, "Bananas", after="Eggs"))

    assert order(client, aldi) == ["milk", "eggs", "bananas"]


@pytest.mark.parametrize("after", [None, "Plasters"], ids=["none", "a name the shop doesn't know"])
def test_with_no_known_name_to_follow_it_goes_at_the_start(
    client: TestClient, aldi: str, after: str | None
) -> None:
    send(client, place(aldi, "Bananas"), place(aldi, "Milk", after="Bananas"))

    send(client, place(aldi, "Eggs", after=after))

    assert order(client, aldi) == ["eggs", "bananas", "milk"]


def test_sending_a_place_again_leaves_the_order_as_it_is(client: TestClient, aldi: str) -> None:
    eggs_after_milk = place(aldi, "Eggs", after="Milk")
    send(client, place(aldi, "Milk"), eggs_after_milk)
    first = send(client, eggs_after_milk).json()
    send(client, place(aldi, "Milk", after="Eggs"))

    again = send(client, eggs_after_milk).json()

    assert again == first
    assert order(client, aldi) == ["eggs", "milk"]


def test_a_place_that_leaves_the_order_unchanged_changes_nothing(client: TestClient, aldi: str) -> None:
    send(client, place(aldi, "Milk"), place(aldi, "Eggs", after="Milk"))

    result = send(client, place(aldi, "eggs.", after=" MILK ")).json()["results"][0]

    assert result["changed"] is False
    assert order(client, aldi) == ["milk", "eggs"]


def test_placing_a_name_after_itself_changes_nothing(client: TestClient, aldi: str) -> None:
    send(client, place(aldi, "Milk"))

    assert send(client, place(aldi, "Milk", after="milk")).json()["results"][0]["changed"] is False


def test_placing_a_name_that_is_all_punctuation_changes_nothing(client: TestClient, aldi: str) -> None:
    assert send(client, place(aldi, "!!")).json()["results"][0]["changed"] is False
    assert order(client, aldi) == []


def test_placing_in_a_shop_that_does_not_exist_changes_nothing(client: TestClient, store: FakeStore) -> None:
    result = send(client, place(str(uuid4()), "Milk")).json()["results"][0]

    assert result["changed"] is False
    assert items(client)["shops"] == []
    assert [(d["type"], d["changed"]) for d in store.shopping.log()] == [("place", False)]


def test_names_are_matched_when_placed(client: TestClient, aldi: str) -> None:
    send(client, place(aldi, "Milk"), place(aldi, "Eggs", after=" milk "))

    send(client, place(aldi, "Bread", after="MILK."))

    assert order(client, aldi) == ["milk", "bread", "eggs"]


@pytest.mark.parametrize(
    ("text", "matched"),
    [
        ("Milk", "milk"),
        (" milk ", "milk"),
        ("Milk.", "milk"),
        ("Milk !", "milk"),
        ("Washing-up   liquid", "washing-up liquid"),
        ("Co-op", "co-op"),
        ("Apples", "apples"),
        ("Bread, sliced!", "bread, sliced"),
    ],
)
def test_names_match_lowercase_trimmed_with_spaces_collapsed_and_trailing_punctuation_stripped(
    text: str, matched: str
) -> None:
    assert match_name(text) == matched


def test_plurals_are_not_merged() -> None:
    assert match_name("apple") != match_name("apples")


def test_the_catch_up_returns_only_shops_changed_after_the_number(client: TestClient, aldi: str) -> None:
    lidl = add_shop("Lidl")
    send(client, lidl, place(aldi, "Milk"))
    assert [s["name"] for s in items(client, after=1)["shops"]] == ["Lidl", "Aldi"]

    send(client, place(lidl["shop_id"], "Eggs"))

    caught_up = items(client, after=3)
    assert caught_up["seq"] == 4
    assert caught_up["shops"] == [{"id": lidl["shop_id"], "name": "Lidl", "order": ["eggs"], "seq": 4}]
    assert items(client, after=4)["shops"] == []


def test_shops_and_items_come_together_and_items_are_as_before(client: TestClient, aldi: str) -> None:
    send(client, add("Milk"), place(aldi, "Milk"))

    caught_up = items(client)

    assert [i["text"] for i in caught_up["items"]] == ["Milk"]
    assert [s["order"] for s in caught_up["shops"]] == [["milk"]]


def test_a_full_shop_drops_the_name_placed_longest_ago(
    client: TestClient, store: FakeStore, aldi: str
) -> None:
    placings = [place(aldi, f"Item {n}", after=f"Item {n - 1}" if n else None) for n in range(MOST_PLACED)]
    for start in range(0, MOST_PLACED, 100):
        send(client, *placings[start : start + 100])
    # Item 0 was placed first, but placing it again makes Item 1 the one placed longest ago.
    send(client, place(aldi, "Item 0", after="Item 499"))
    assert len(order(client, aldi)) == MOST_PLACED

    send(client, place(aldi, "Item 500", after="Item 0"))

    learned = order(client, aldi)
    assert len(learned) == MOST_PLACED
    assert "item 1" not in learned
    assert learned[-2:] == ["item 0", "item 500"]


def test_two_places_racing_on_one_shop_both_land(client: TestClient, store: FakeStore, aldi: str) -> None:
    first, second = place(aldi, "Milk"), place(aldi, "Eggs")
    # Just before the first writes, another request places Eggs in the same shop.
    store.shopping.before_next_commit = lambda: send(client, second)

    response = send(client, first)

    assert response.json()["results"][0]["changed"] is True
    assert order(client, aldi) == ["milk", "eggs"]
    assert [d["name"] for d in store.shopping.log() if d["type"] == "place"] == ["Eggs", "Milk"]


def test_a_bad_place_is_a_422(client: TestClient, store: FakeStore) -> None:
    bad = [
        place(str(uuid4()), "   "),
        place(str(uuid4()), "Milk", after="x" * 201),
        place("not-a-uuid", "Milk"),
    ]
    for operation in bad:
        response = client.post(
            "/lists/shopping/operations",
            json={"operations": [operation]},
            headers={"Authorization": f"Bearer {token()}"},
        )
        assert response.status_code == 422, operation
    assert store.shopping.docs == {}

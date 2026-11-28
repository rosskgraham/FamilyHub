"""Saved meals and the dinner plan (#97), through the API, with test_lists' stand-in for Cosmos DB."""

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_lists import Clock, FakeStore
from test_live import FakeLive
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.lists import Clash
from familyhub_api.main import create_app


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def live() -> FakeLive:
    return FakeLive()


@pytest.fixture
def client(store: FakeStore, live: FakeLive) -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return TestClient(create_app(checker=checker, accounts=accounts, store=store, live=live, clock=Clock()))


def send(client: TestClient, *operations: dict[str, Any], bearer: str | None = None) -> Any:
    return client.post(
        "/meals/operations",
        json={"operations": list(operations)},
        headers={"Authorization": f"Bearer {bearer or token()}"},
    )


def sent(client: TestClient, *operations: dict[str, Any]) -> list[dict[str, Any]]:
    response = send(client, *operations)
    assert response.status_code == 200, response.text
    return response.json()["results"]


def meals(client: TestClient, after: int = 0, bearer: str | None = None) -> Any:
    response = client.get(
        "/meals", params={"after": after}, headers={"Authorization": f"Bearer {bearer or token()}"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def add_meal(name: str, ingredients: list[str] | None = None, meal_id: str | None = None) -> dict[str, Any]:
    operation = {"id": str(uuid4()), "type": "add_meal", "meal_id": meal_id or str(uuid4()), "name": name}
    return operation | ({"ingredients": ingredients} if ingredients is not None else {})


def edit_meal(meal_id: str, **changes: Any) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "edit_meal", "meal_id": meal_id} | changes


def remove_meal(meal_id: str) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "remove_meal", "meal_id": meal_id}


def plan(day: str, meal_id: str) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "plan", "date": day, "meal_id": meal_id}


def unplan(day: str) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "unplan", "date": day}


def test_an_added_meal_is_kept_with_its_ingredients_in_order(client: TestClient) -> None:
    curry = add_meal("Chicken curry", ["Chicken thighs", "Onions", "Curry paste", "Rice"])

    assert sent(client, curry) == [{"id": curry["id"], "seq": 1, "changed": True}]
    assert meals(client) == {
        "meals": [
            {
                "id": curry["meal_id"],
                "name": "Chicken curry",
                "ingredients": ["Chicken thighs", "Onions", "Curry paste", "Rice"],
                "removed": False,
                "seq": 1,
            }
        ],
        "plan": [],
        "seq": 1,
    }


def test_a_meal_with_no_ingredients_is_fine_for_one_offs_like_a_takeaway(client: TestClient) -> None:
    takeaway = add_meal("Takeaway")
    sent(client, takeaway)
    [meal] = meals(client)["meals"]
    assert meal["ingredients"] == []


def test_an_edit_replaces_the_name_or_the_whole_ingredient_list(client: TestClient) -> None:
    curry = add_meal("Curry", ["Chicken", "Rice"])
    meal_id = curry["meal_id"]
    sent(client, curry)

    sent(client, edit_meal(meal_id, name="Chicken curry"))
    assert meals(client)["meals"][0] | {"seq": None} == {
        "id": meal_id,
        "name": "Chicken curry",
        "ingredients": ["Chicken", "Rice"],
        "removed": False,
        "seq": None,
    }

    sent(client, edit_meal(meal_id, ingredients=["Chicken thighs", "Naan"]))
    assert meals(client)["meals"][0]["ingredients"] == ["Chicken thighs", "Naan"]

    sent(client, edit_meal(meal_id, name="Curry night", ingredients=[]))
    [meal] = meals(client)["meals"]
    assert (meal["name"], meal["ingredients"], meal["seq"]) == ("Curry night", [], 4)


def test_an_edit_that_changes_nothing_says_so(client: TestClient) -> None:
    curry = add_meal("Curry", ["Rice"])
    sent(client, curry)
    [result] = sent(client, edit_meal(curry["meal_id"], name="Curry", ingredients=["Rice"]))
    assert result["changed"] is False
    assert meals(client)["meals"][0]["seq"] == 1


def test_a_removed_meal_comes_as_a_marker_in_the_catch_up_and_drops_out_from_nothing(
    client: TestClient,
) -> None:
    curry = add_meal("Curry")
    sent(client, curry)

    [result] = sent(client, remove_meal(curry["meal_id"]))

    assert meals(client, after=1)["meals"] == [
        {"id": curry["meal_id"], "name": "Curry", "ingredients": [], "removed": True, "seq": 2}
    ]
    assert meals(client)["meals"] == []
    # A removed meal stays removed: editing it or adding its id again changes nothing.
    assert result["changed"] is True
    assert sent(client, edit_meal(curry["meal_id"], name="Back"))[0]["changed"] is False
    assert sent(client, add_meal("Back", meal_id=curry["meal_id"]))[0]["changed"] is False


def test_plan_sets_a_meal_for_a_date_and_planning_it_again_replaces_it(client: TestClient) -> None:
    curry, pasta = add_meal("Curry"), add_meal("Pasta")
    sent(client, curry, pasta)

    sent(client, plan("2026-11-30", curry["meal_id"]))
    assert meals(client)["plan"] == [{"date": "2026-11-30", "meal_id": curry["meal_id"], "seq": 3}]

    sent(client, plan("2026-11-30", pasta["meal_id"]))
    assert meals(client)["plan"] == [{"date": "2026-11-30", "meal_id": pasta["meal_id"], "seq": 4}]


def test_planning_the_same_meal_again_changes_nothing(client: TestClient) -> None:
    curry = add_meal("Curry")
    sent(client, curry, plan("2026-11-30", curry["meal_id"]))
    assert sent(client, plan("2026-11-30", curry["meal_id"]))[0]["changed"] is False


def test_unplan_clears_a_date(client: TestClient) -> None:
    curry = add_meal("Curry")
    sent(client, curry, plan("2026-11-30", curry["meal_id"]), plan("2026-12-01", curry["meal_id"]))

    [result] = sent(client, unplan("2026-11-30"))

    assert result["changed"] is True
    # From nothing, an unplanned day isn't sent. Catching up, it comes as a day with no meal.
    assert meals(client)["plan"] == [{"date": "2026-12-01", "meal_id": curry["meal_id"], "seq": 3}]
    assert meals(client, after=3)["plan"] == [{"date": "2026-11-30", "meal_id": None, "seq": 4}]
    # Unplanning a day with nothing planned changes nothing.
    assert sent(client, unplan("2026-11-30"), unplan("2026-12-25"))[0]["changed"] is False


def test_the_plan_comes_in_date_order_and_keeps_past_days(client: TestClient) -> None:
    curry = add_meal("Curry")
    sent(client, curry)
    sent(client, plan("2026-12-02", curry["meal_id"]), plan("2025-06-01", curry["meal_id"]))
    assert [day["date"] for day in meals(client)["plan"]] == ["2025-06-01", "2026-12-02"]


def test_a_planned_meal_that_s_removed_leaves_the_day_pointing_at_it(client: TestClient) -> None:
    curry = add_meal("Curry")
    sent(client, curry, plan("2026-11-30", curry["meal_id"]), remove_meal(curry["meal_id"]))
    assert meals(client)["plan"] == [{"date": "2026-11-30", "meal_id": curry["meal_id"], "seq": 2}]


def test_sending_the_same_operation_twice_gets_the_same_answer_and_changes_nothing(
    client: TestClient, store: FakeStore
) -> None:
    curry = add_meal("Curry", ["Rice"])
    first = sent(client, curry)
    planned = plan("2026-11-30", curry["meal_id"])
    sent(client, planned)
    logged = len(store.meals.log())

    assert sent(client, curry) == first
    assert sent(client, planned)[0]["seq"] == 2
    assert len(store.meals.log()) == logged
    assert meals(client)["seq"] == 2


def test_the_catch_up_after_a_number_has_only_what_changed_since(client: TestClient) -> None:
    curry, pasta = add_meal("Curry"), add_meal("Pasta")
    sent(client, curry, pasta, plan("2026-11-30", curry["meal_id"]))
    sent(client, edit_meal(pasta["meal_id"], name="Pesto pasta"), plan("2026-12-01", pasta["meal_id"]))

    caught_up = meals(client, after=3)

    assert [meal["name"] for meal in caught_up["meals"]] == ["Pesto pasta"]
    assert caught_up["plan"] == [{"date": "2026-12-01", "meal_id": pasta["meal_id"], "seq": 5}]
    assert caught_up["seq"] == 5
    assert meals(client, after=5) == {"meals": [], "plan": [], "seq": 5}


@pytest.mark.parametrize(
    ("operation", "why"),
    [
        (add_meal(""), "an empty name"),
        (add_meal("   "), "a name of spaces"),
        (add_meal("Curry", ["Rice", ""]), "an empty ingredient"),
        (add_meal("Curry", [f"Thing {n}" for n in range(51)]), "more than 50 ingredients"),
        (add_meal("x" * 201), "a name over 200 characters"),
        (edit_meal(str(uuid4())), "an edit with nothing in it"),
        (plan("30/11/2026", str(uuid4())), "a date that isn't YYYY-MM-DD"),
        (plan("2026-11-31", str(uuid4())), "a date that doesn't exist"),
        (plan("2026-1-30", str(uuid4())), "a date without its leading zero"),
        (unplan("tomorrow"), "an unplan with no real date"),
    ],
)
def test_bad_input_is_refused(
    client: TestClient, store: FakeStore, operation: dict[str, Any], why: str
) -> None:
    assert send(client, operation).status_code == 422, why
    assert store.meals.log() == []


def test_50_ingredients_is_fine(client: TestClient) -> None:
    sent(client, add_meal("Big shop", [f"Thing {n}" for n in range(50)]))
    assert len(meals(client)["meals"][0]["ingredients"]) == 50


def test_planning_a_meal_that_was_never_added_is_refused_and_the_batch_changes_nothing(
    client: TestClient, store: FakeStore
) -> None:
    curry = add_meal("Curry")

    response = send(client, curry, plan("2026-11-30", str(uuid4())))

    assert response.status_code == 422
    assert "No meal" in response.json()["detail"]
    assert store.meals.log() == []


def test_a_meal_added_earlier_in_the_same_batch_can_be_planned(client: TestClient) -> None:
    curry = add_meal("Curry")
    sent(client, curry, plan("2026-11-30", curry["meal_id"]))
    assert meals(client)["plan"][0]["meal_id"] == curry["meal_id"]


def test_the_hub_and_members_may_use_both_endpoints_but_no_one_else(client: TestClient) -> None:
    curry = add_meal("Curry")
    assert send(client, curry, bearer=hub_token()).status_code == 200
    assert send(client, add_meal("Pasta"), bearer=token()).status_code == 200
    assert len(meals(client, bearer=hub_token())["meals"]) == 2
    assert len(meals(client, bearer=token())["meals"]) == 2
    assert client.get("/meals").status_code == 401
    assert client.post("/meals/operations", json={"operations": [add_meal("X")]}).status_code == 401


def test_the_log_keeps_who_sent_each_operation_and_what_it_carried(
    client: TestClient, store: FakeStore
) -> None:
    curry = add_meal("Curry", ["Rice"])
    send(client, curry, bearer=hub_token())
    sent(client, plan("2026-11-30", curry["meal_id"]))

    added, planned = store.meals.log()
    assert added | {"at": None, "_etag": None} == {
        "id": f"op-{curry['id']}",
        "listId": "meals",
        "kind": "op",
        "opId": curry["id"],
        "type": "add_meal",
        "meal_id": curry["meal_id"],
        "name": "Curry",
        "ingredients": ["Rice"],
        "seq": 1,
        "changed": True,
        "at": None,
        "sentBy": "hub",
        "_etag": None,
    }
    assert (planned["type"], planned["date"], planned["sentBy"]) == ("plan", "2026-11-30", "ross")


def test_a_saved_change_tells_web_pubsub_for_the_meals_list(client: TestClient, live: FakeLive) -> None:
    curry = add_meal("Curry")
    sent(client, curry, plan("2026-11-30", curry["meal_id"]))
    assert live.messages == [("meals", 2)]

    # Nothing changed, so nothing to tell.
    sent(client, plan("2026-11-30", curry["meal_id"]))
    assert live.messages == [("meals", 2)]


def test_meals_and_the_shopping_list_are_kept_apart(client: TestClient, store: FakeStore) -> None:
    sent(client, add_meal("Curry"))
    assert store.shopping.docs == {}
    assert store.meals.read("counter")["seq"] == 1  # type: ignore[index]


def test_an_operation_and_its_counter_are_written_together_and_a_clash_is_tried_again(
    client: TestClient, store: FakeStore
) -> None:
    curry = add_meal("Curry")
    sent(client, curry)

    # Another request takes the next number first: this one is tried again with the one after.
    def another_request() -> None:
        store.meals.docs["counter"] = store.meals.docs["counter"] | {"seq": 2, "_etag": "someone-else"}

    store.meals.before_next_commit = another_request
    [result] = sent(client, edit_meal(curry["meal_id"], name="Chicken curry"))

    assert result == {"id": result["id"], "seq": 3, "changed": True}
    assert [doc["seq"] for doc in store.meals.log()] == [1, 3]


def test_a_store_that_always_clashes_is_a_503(client: TestClient, store: FakeStore) -> None:
    store.meals.always_clash = True
    assert send(client, add_meal("Curry")).status_code == 503


def test_clash_is_the_lists_one() -> None:
    # The meals reuse the lists' transactional batch and its Clash, so the Cosmos partition serves both.
    from familyhub_api import meals

    assert meals.Clash is Clash

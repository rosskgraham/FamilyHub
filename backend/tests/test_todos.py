"""The To-dos (#118), through the API, with test_lists' stand-in for Cosmos DB."""

from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_lists import START, Clock, FakeStore
from test_live import FakeLive
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.main import create_app


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def live() -> FakeLive:
    return FakeLive()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(store: FakeStore, live: FakeLive, clock: Clock) -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return TestClient(create_app(checker=checker, accounts=accounts, store=store, live=live, clock=clock))


def send(client: TestClient, *operations: dict[str, Any], bearer: str | None = None) -> Any:
    return client.post(
        "/lists/todos/operations",
        json={"operations": list(operations)},
        headers={"Authorization": f"Bearer {bearer or token()}"},
    )


def sent(client: TestClient, *operations: dict[str, Any]) -> list[dict[str, Any]]:
    response = send(client, *operations)
    assert response.status_code == 200, response.text
    return response.json()["results"]


def todos(client: TestClient, after: int = 0, bearer: str | None = None) -> Any:
    response = client.get(
        "/lists/todos/items",
        params={"after": after},
        headers={"Authorization": f"Bearer {bearer or token()}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def add_todo(text: str, due: str | None = None, todo_id: str | None = None) -> dict[str, Any]:
    operation = {"id": str(uuid4()), "type": "add_todo", "todo_id": todo_id or str(uuid4()), "text": text}
    return operation | ({"due": due} if due is not None else {})


def edit_todo(todo_id: str, **changes: Any) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "edit_todo", "todo_id": todo_id} | changes


def op(kind: str, todo_id: str) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": kind, "todo_id": todo_id}


def test_an_added_todo_is_kept_with_its_due_date(client: TestClient) -> None:
    bins = add_todo("Put the bins out", "2026-11-30")

    assert sent(client, bins) == [{"id": bins["id"], "seq": 1, "changed": True}]
    assert todos(client) == {
        "todos": [
            {
                "id": bins["todo_id"],
                "text": "Put the bins out",
                "due": "2026-11-30",
                "ticked_off": False,
                "ticked_off_at": None,
                "removed": False,
                "seq": 1,
            }
        ],
        "seq": 1,
    }


def test_a_todo_with_no_due_date_is_fine_for_anyone_to_pick_up(client: TestClient) -> None:
    sent(client, add_todo("Fix the shed door"))
    assert todos(client)["todos"][0]["due"] is None


def test_an_edit_changes_the_text_the_due_date_or_both(client: TestClient) -> None:
    bins = add_todo("Bins", "2026-11-30")
    sent(client, bins)
    todo_id = bins["todo_id"]

    sent(client, edit_todo(todo_id, text="Put the bins out"))
    assert (todos(client)["todos"][0]["text"], todos(client)["todos"][0]["due"]) == (
        "Put the bins out",
        "2026-11-30",
    )

    sent(client, edit_todo(todo_id, due="2026-12-01"))
    assert (todos(client)["todos"][0]["text"], todos(client)["todos"][0]["due"]) == (
        "Put the bins out",
        "2026-12-01",
    )

    sent(client, edit_todo(todo_id, text="Recycling out", due="2026-12-07"))
    [todo] = todos(client)["todos"]
    assert (todo["text"], todo["due"], todo["seq"]) == ("Recycling out", "2026-12-07", 4)


def test_an_edit_with_a_null_due_date_takes_the_date_off(client: TestClient) -> None:
    bins = add_todo("Bins", "2026-11-30")
    sent(client, bins)

    sent(client, edit_todo(bins["todo_id"], due=None))

    assert todos(client)["todos"][0]["due"] is None


def test_an_edit_that_changes_nothing_says_so(client: TestClient) -> None:
    bins = add_todo("Bins", "2026-11-30")
    sent(client, bins)

    [result] = sent(client, edit_todo(bins["todo_id"], text="Bins", due="2026-11-30"))

    assert result["changed"] is False
    assert todos(client)["todos"][0]["seq"] == 1


def test_editing_the_text_never_undoes_a_tick(client: TestClient) -> None:
    bins = add_todo("Bins")
    sent(client, bins, op("tick", bins["todo_id"]), edit_todo(bins["todo_id"], text="Put the bins out"))

    [todo] = todos(client)["todos"]
    assert (todo["text"], todo["ticked_off"]) == ("Put the bins out", True)


def test_tick_and_untick_set_and_clear_done_with_its_time(client: TestClient, clock: Clock) -> None:
    bins = add_todo("Bins")
    sent(client, bins)
    clock.now = START + timedelta(minutes=3)

    sent(client, op("tick", bins["todo_id"]))
    [todo] = todos(client)["todos"]
    assert (todo["ticked_off"], todo["ticked_off_at"]) == (True, "2026-11-22T09:03:00Z")

    sent(client, op("untick", bins["todo_id"]))
    [todo] = todos(client)["todos"]
    assert (todo["ticked_off"], todo["ticked_off_at"]) == (False, None)


def test_ticking_twice_changes_nothing_the_second_time(client: TestClient) -> None:
    bins = add_todo("Bins")
    results = sent(client, bins, op("tick", bins["todo_id"]), op("tick", bins["todo_id"]))
    assert [r["changed"] for r in results] == [True, True, False]


def test_a_removed_todo_comes_as_a_marker_and_beats_a_later_edit(client: TestClient) -> None:
    bins = add_todo("Bins", "2026-11-30")
    sent(client, bins)

    results = sent(
        client,
        op("remove", bins["todo_id"]),
        edit_todo(bins["todo_id"], text="Put the bins out"),
        op("untick", bins["todo_id"]),
        op("tick", bins["todo_id"]),
    )

    assert [r["changed"] for r in results] == [True, False, False, False]
    [marker] = todos(client, after=1)["todos"]
    assert (marker["removed"], marker["text"], marker["seq"]) == (True, "Bins", 2)
    assert todos(client)["todos"] == []


def test_a_todo_id_already_used_isn_t_added_again(client: TestClient) -> None:
    bins = add_todo("Bins")
    sent(client, bins, op("remove", bins["todo_id"]))

    [result] = sent(client, add_todo("Bins again", todo_id=bins["todo_id"]))

    assert result["changed"] is False
    assert todos(client)["todos"] == []


def test_operations_on_a_todo_never_added_change_nothing(client: TestClient) -> None:
    unknown = str(uuid4())
    results = sent(client, op("tick", unknown), edit_todo(unknown, text="X"), op("remove", unknown))
    assert [r["changed"] for r in results] == [False, False, False]
    assert todos(client) == {"todos": [], "seq": 3}


def test_from_nothing_the_catch_up_has_todos_not_done_and_those_ticked_off_in_the_last_10_minutes(
    client: TestClient, clock: Clock
) -> None:
    bins, shed, dentist = add_todo("Bins"), add_todo("Shed"), add_todo("Dentist")
    sent(client, bins, shed, dentist, op("tick", shed["todo_id"]))
    clock.now = START + timedelta(minutes=9)
    sent(client, op("tick", dentist["todo_id"]))

    clock.now = START + timedelta(minutes=12)

    assert [t["text"] for t in todos(client)["todos"]] == ["Bins", "Dentist"]


def test_after_a_number_the_catch_up_has_only_what_changed_since(client: TestClient, clock: Clock) -> None:
    bins, shed = add_todo("Bins"), add_todo("Shed")
    sent(client, bins, shed)

    sent(client, op("tick", bins["todo_id"]))
    clock.now = START + timedelta(hours=1)

    caught_up = todos(client, after=2)
    assert [(t["text"], t["ticked_off"], t["seq"]) for t in caught_up["todos"]] == [("Bins", True, 3)]
    assert caught_up["seq"] == 3
    assert todos(client, after=3) == {"todos": [], "seq": 3}


def test_sending_the_same_operation_twice_gets_the_same_answer_and_changes_nothing(
    client: TestClient, store: FakeStore, live: FakeLive
) -> None:
    bins = add_todo("Bins")
    tick = op("tick", bins["todo_id"])
    first = sent(client, bins, tick)

    again = sent(client, bins, tick)

    assert again == first
    assert len(store.todos.log()) == 2
    assert todos(client)["seq"] == 2
    assert live.messages == [("todos", 2)]


@pytest.mark.parametrize(
    ("operation", "why"),
    [
        (add_todo(""), "an empty text"),
        (add_todo("x" * 201), "a text over 200 characters"),
        (add_todo("Bins", "30/11/2026"), "a due date not written YYYY-MM-DD"),
        (add_todo("Bins", "2026-02-30"), "a due date that doesn't exist"),
        (edit_todo(str(uuid4())), "an edit with nothing to change"),
        (edit_todo(str(uuid4()), text=None), "an edit whose only change is no text"),
        (
            {"id": str(uuid4()), "type": "rename", "todo_id": str(uuid4()), "text": "X"},
            "a Shopping operation",
        ),
    ],
)
def test_bad_input_is_refused(
    client: TestClient, store: FakeStore, operation: dict[str, Any], why: str
) -> None:
    assert send(client, operation).status_code == 422, why
    assert store.todos.log() == []


def test_the_hub_and_members_may_use_both_endpoints_but_no_one_else(client: TestClient) -> None:
    assert send(client, add_todo("Bins"), bearer=hub_token()).status_code == 200
    assert send(client, add_todo("Shed"), bearer=token()).status_code == 200
    assert len(todos(client, bearer=hub_token())["todos"]) == 2
    assert len(todos(client, bearer=token())["todos"]) == 2
    assert client.get("/lists/todos/items").status_code == 401
    assert client.post("/lists/todos/operations", json={"operations": [add_todo("X")]}).status_code == 401


def test_the_log_keeps_who_sent_each_operation_and_what_it_carried(
    client: TestClient, store: FakeStore
) -> None:
    bins = add_todo("Bins", "2026-11-30")
    send(client, bins, bearer=hub_token())
    sent(client, edit_todo(bins["todo_id"], due=None))

    added, edited = store.todos.log()
    assert added | {"at": None, "_etag": None} == {
        "id": f"op-{bins['id']}",
        "listId": "todos",
        "kind": "op",
        "opId": bins["id"],
        "type": "add_todo",
        "todo_id": bins["todo_id"],
        "text": "Bins",
        "due": "2026-11-30",
        "seq": 1,
        "changed": True,
        "at": None,
        "sentBy": "hub",
        "_etag": None,
    }
    # The null due date is what took the date off, so it's kept.
    assert (edited["type"], edited["due"], edited["sentBy"]) == ("edit_todo", None, "ross")
    assert "text" not in edited


def test_the_todo_keeps_who_added_it_and_when(client: TestClient, store: FakeStore, clock: Clock) -> None:
    bins = add_todo("Bins")
    send(client, bins, bearer=hub_token())
    clock.now = START + timedelta(hours=1)
    sent(client, op("tick", bins["todo_id"]))

    doc = store.todos.read(f"todo-{bins['todo_id']}")
    assert doc is not None
    assert (doc["addedBy"], doc["addedAt"], doc["kind"]) == ("hub", "2026-11-22T09:00:00.000000Z", "todo")


def test_a_saved_change_tells_web_pubsub_that_the_todos_list_changed(
    client: TestClient, live: FakeLive
) -> None:
    bins = add_todo("Bins")
    sent(client, bins, op("tick", bins["todo_id"]))
    assert live.messages == [("todos", 2)]

    # Nothing changed, so nothing to tell.
    sent(client, op("tick", bins["todo_id"]))
    assert live.messages == [("todos", 2)]


def test_todos_are_kept_apart_from_the_shopping_list_and_meals(client: TestClient, store: FakeStore) -> None:
    sent(client, add_todo("Bins"))
    assert store.shopping.docs == {}
    assert store.meals.docs == {}
    assert store.todos.read("counter")["seq"] == 1  # type: ignore[index]


def test_an_operation_and_its_counter_are_written_together_and_a_clash_is_tried_again(
    client: TestClient, store: FakeStore
) -> None:
    bins = add_todo("Bins")
    sent(client, bins)

    # Another request takes the next number first: this one is tried again with the one after.
    def another_request() -> None:
        store.todos.docs["counter"] = store.todos.docs["counter"] | {"seq": 2, "_etag": "someone-else"}

    store.todos.before_next_commit = another_request
    [result] = sent(client, op("tick", bins["todo_id"]))

    assert result == {"id": result["id"], "seq": 3, "changed": True}
    assert [doc["seq"] for doc in store.todos.log()] == [1, 3]


def test_a_store_that_always_clashes_is_a_503(client: TestClient, store: FakeStore) -> None:
    store.todos.always_clash = True
    assert send(client, add_todo("Bins")).status_code == 503

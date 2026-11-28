"""Checks the To-dos on the backend by hand (#118), with a test To-do.

    uv run python scripts/todos.py member list      # a browser opens: sign in with Google
    uv run python scripts/todos.py hub list         # signed in as the Hub
    uv run python scripts/todos.py hub check        # adds, edits, ticks, reads back and removes a test To-do

list shows the To-dos as a device starting from nothing would get them. check adds a To-do named
"Test to-do …", due 31 December 2099, a date no real To-do reaches, edits its text, ticks it off, checks the
catch-up has it ticked, then removes it, leaving only a removed marker behind.

It signs in as scripts/whoami.py does, with the same environment variables.
"""

import json
import sys
import time
import uuid
from typing import Any, Protocol

from shopping import Api as ShoppingApi
from whoami import hub_token, member_token, setting

# A date no real To-do reaches, so the test To-do is never mistaken for one.
TEST_DATE = "2099-12-31"


class TodosApi(Protocol):
    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]: ...

    def todos(self, after: int = 0) -> dict[str, Any]: ...


class Api(ShoppingApi):
    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]:
        status, body = self.call("POST", "/lists/todos/operations", {"operations": list(operations)})
        if status != 200:
            sys.exit(f"POST To-do operations: {status} {body}")
        return body["results"]

    def todos(self, after: int = 0) -> dict[str, Any]:
        status, body = self.call("GET", f"/lists/todos/items?after={after}")
        if status != 200:
            sys.exit(f"GET To-dos: {status} {body}")
        return body


def op(kind: str, **fields: Any) -> dict[str, Any]:
    return {"id": str(uuid.uuid4()), "type": kind} | fields


def check(api: TodosApi) -> int:
    """Runs through a test To-do, saying what it expected and what it got. Returns how many checks failed."""
    failures = 0

    def expect(what: str, ok: bool, got: Any) -> None:
        nonlocal failures
        failures += 0 if ok else 1
        print(f"{'ok  ' if ok else 'FAIL'} {what}" + ("" if ok else f": got {got}"))

    start = api.todos()["seq"]
    print(f"The To-dos are at {start}.")
    todo_id = str(uuid.uuid4())
    text = f"Test to-do {time.strftime('%H:%M:%S')}"
    added = op("add_todo", todo_id=todo_id, text=text, due=TEST_DATE)
    results = api.send(
        added, op("edit_todo", todo_id=todo_id, text=f"{text} edited"), op("tick", todo_id=todo_id)
    )
    expect(
        "adding, editing and ticking it all changed something", all(r["changed"] for r in results), results
    )

    caught_up = api.todos(start)
    todo = {t["id"]: t for t in caught_up["todos"]}.get(todo_id, {})
    expect(
        "the catch-up has it edited, due on its date and ticked off",
        todo.get("text") == f"{text} edited"
        and todo.get("due") == TEST_DATE
        and todo.get("ticked_off") is True
        and todo.get("ticked_off_at") is not None,
        todo,
    )
    expect(
        "from nothing, it's there as ticked off in the last 10 minutes",
        any(t["id"] == todo_id for t in api.todos()["todos"]),
        api.todos(),
    )
    again = api.send(added)
    expect(
        "sending the add again gets the same answer and changes nothing",
        again == results[:1] and api.todos(caught_up["seq"])["seq"] == caught_up["seq"],
        again,
    )

    api.send(op("remove", todo_id=todo_id))
    after = api.todos(caught_up["seq"])
    expect("removed", any(t["id"] == todo_id and t["removed"] for t in after["todos"]), after)
    print("All good." if failures == 0 else f"{failures} failed.")
    return failures


def main() -> None:
    who, command = (sys.argv[1:3] + ["", ""])[:2]
    if who not in ("member", "hub") or command not in ("list", "check"):
        sys.exit("Usage: todos.py member|hub list|check")
    tenant_id = setting("FAMILYHUB_ENTRA_TENANT_ID")
    authority = f"https://{setting('FAMILYHUB_ENTRA_SUBDOMAIN')}.ciamlogin.com/{tenant_id}"
    result = (member_token if who == "member" else hub_token)(authority, setting("FAMILYHUB_API_CLIENT_ID"))
    if "access_token" not in result:
        sys.exit(f"Signing in failed: {result.get('error')}: {result.get('error_description')}")
    api = Api(setting("FAMILYHUB_API_URL").rstrip("/"), result["access_token"])
    if command == "list":
        print(json.dumps(api.todos(), indent=2))
        return
    sys.exit(1 if check(api) else 0)


if __name__ == "__main__":
    main()

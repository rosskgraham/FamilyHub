"""Checks the Shopping list's operations and catch-up on the backend by hand, with test items.

    uv run python scripts/shopping.py member list      # a browser opens: sign in with Google
    uv run python scripts/shopping.py member check     # adds, ticks, renames and removes test items
    uv run python scripts/shopping.py hub check        # the same, signed in as the Hub

list shows the Shopping list as a device starting from nothing would get it. check runs through every
operation, sends one twice, and sends 10 adds at once, saying what it expected and what it got. Its items are
named "Test item …" and it removes them again, leaving only removed markers behind.

It signs in as scripts/whoami.py does, with the same environment variables.
"""

import json
import sys
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from whoami import hub_token, member_token, setting


class Api:
    def __init__(self, url: str, access_token: str) -> None:
        self._url = url
        self._headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    def call(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self._url}{path}", data, self._headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode(errors="replace")

    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]:
        status, body = self.call("POST", "/lists/shopping/operations", {"operations": list(operations)})
        if status != 200:
            sys.exit(f"POST operations: {status} {body}")
        return body["results"]

    def items(self, after: int = 0) -> dict[str, Any]:
        status, body = self.call("GET", f"/lists/shopping/items?after={after}")
        if status != 200:
            sys.exit(f"GET items: {status} {body}")
        return body


def op(kind: str, item_id: str, text: str | None = None) -> dict[str, Any]:
    operation = {"id": str(uuid.uuid4()), "type": kind, "item_id": item_id}
    return operation | ({"text": text} if text is not None else {})


failures = 0


def expect(what: str, ok: bool, got: Any) -> None:
    global failures
    failures += 0 if ok else 1
    print(f"{'ok  ' if ok else 'FAIL'} {what}" + ("" if ok else f": got {got}"))


def check(api: Api) -> None:
    start = api.items()["seq"]
    print(f"The list is at {start}.")
    item_id = str(uuid.uuid4())
    text = f"Test item {item_id[:8]}"

    [added] = api.send(op("add", item_id, text))
    expect("an add gets the next number", added["seq"] > start and added["changed"], added)
    mine = [i for i in api.items()["items"] if i["id"] == item_id]
    expect("the added item is on the list", len(mine) == 1 and mine[0]["text"] == text, mine)

    tick = op("tick", item_id)
    [ticked] = api.send(tick)
    after_tick = api.items(added["seq"])["items"]
    expect("a tick ticks it off", after_tick and after_tick[0]["ticked_off"] is True, after_tick)

    [renamed] = api.send(op("rename", item_id, text + " renamed"))
    [item] = api.items(ticked["seq"])["items"]
    expect("a rename keeps it ticked off", item["text"].endswith("renamed") and item["ticked_off"], item)

    [again] = api.send(tick)
    expect("sending the tick again gives the same answer", again == ticked, again)
    expect("and changes nothing", api.items(renamed["seq"])["items"] == [], api.items(renamed["seq"]))

    [unticked] = api.send(op("untick", item_id))
    next_number = unticked["changed"] and unticked["seq"] > renamed["seq"]
    expect("an untick gets the next number", next_number, unticked)

    api.send(op("remove", item_id))
    [marker] = api.items(unticked["seq"])["items"]
    expect("a remove leaves a marker", marker["removed"] is True, marker)
    [late] = api.send(op("tick", item_id))
    expect("a tick after the remove changes nothing", late["changed"] is False, late)
    expect("and it's gone from the list", all(i["id"] != item_id for i in api.items()["items"]), "")

    # 10 adds at once, each in its own request.
    before = api.items()["seq"]
    adds = [op("add", str(uuid.uuid4()), f"Test item race {n}") for n in range(10)]
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = [r for rs in pool.map(lambda a: api.send(a), adds) for r in rs]
    numbers = sorted(r["seq"] for r in results)
    expect("10 adds at once get 10 different numbers", len(set(numbers)) == 10, numbers)
    caught_up = {i["id"] for i in api.items(before)["items"]}
    expect("and all 10 are in the catch-up", {a["item_id"] for a in adds} <= caught_up, caught_up)
    api.send(*[op("remove", a["item_id"]) for a in adds])

    print("All good." if failures == 0 else f"{failures} failed.")


def main() -> None:
    who, command = (sys.argv[1:3] + ["", ""])[:2]
    if who not in ("member", "hub") or command not in ("list", "check"):
        sys.exit("Usage: shopping.py member|hub list|check")
    tenant_id = setting("FAMILYHUB_ENTRA_TENANT_ID")
    authority = f"https://{setting('FAMILYHUB_ENTRA_SUBDOMAIN')}.ciamlogin.com/{tenant_id}"
    api_client_id = setting("FAMILYHUB_API_CLIENT_ID")
    result = (member_token if who == "member" else hub_token)(authority, api_client_id)
    if "access_token" not in result:
        sys.exit(f"Signing in failed: {result.get('error')}: {result.get('error_description')}")
    api = Api(setting("FAMILYHUB_API_URL").rstrip("/"), result["access_token"])

    if command == "list":
        print(json.dumps(api.items(), indent=2))
    else:
        check(api)
        sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

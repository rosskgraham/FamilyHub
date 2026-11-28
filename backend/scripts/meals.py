"""Checks the saved meals and the dinner plan on the backend by hand (#97), with a test meal.

    uv run python scripts/meals.py member list      # a browser opens: sign in with Google
    uv run python scripts/meals.py hub list         # signed in as the Hub
    uv run python scripts/meals.py hub check        # adds, plans, reads back, unplans and removes a test meal

list shows the meals and the plan as a device starting from nothing would get them. check adds a meal named
"Test meal …", plans it on 31 December 2099, a date no real plan reaches, checks the catch-up has both, then
unplans that date and removes the meal, leaving only a removed marker and an empty plan day behind.

It signs in as scripts/whoami.py does, with the same environment variables.
"""

import json
import sys
import time
import uuid
from typing import Any, Protocol

from shopping import Api as ShoppingApi
from whoami import hub_token, member_token, setting

# A date no real plan reaches, so the check never touches the Household's plan.
TEST_DATE = "2099-12-31"


class MealsApi(Protocol):
    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]: ...

    def meals(self, after: int = 0) -> dict[str, Any]: ...


class Api(ShoppingApi):
    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]:
        status, body = self.call("POST", "/meals/operations", {"operations": list(operations)})
        if status != 200:
            sys.exit(f"POST meal operations: {status} {body}")
        return body["results"]

    def meals(self, after: int = 0) -> dict[str, Any]:
        status, body = self.call("GET", f"/meals?after={after}")
        if status != 200:
            sys.exit(f"GET meals: {status} {body}")
        return body


def op(kind: str, **fields: Any) -> dict[str, Any]:
    return {"id": str(uuid.uuid4()), "type": kind} | fields


def check(api: MealsApi) -> int:
    """Runs through a test meal, saying what it expected and what it got. Returns how many checks failed."""
    failures = 0

    def expect(what: str, ok: bool, got: Any) -> None:
        nonlocal failures
        failures += 0 if ok else 1
        print(f"{'ok  ' if ok else 'FAIL'} {what}" + ("" if ok else f": got {got}"))

    start = api.meals()["seq"]
    print(f"The meals are at {start}.")
    meal_id = str(uuid.uuid4())
    name = f"Test meal {time.strftime('%H:%M:%S')}"
    added = op("add_meal", meal_id=meal_id, name=name, ingredients=["Test onion", "Test rice"])
    results = api.send(added, op("plan", date=TEST_DATE, meal_id=meal_id))
    expect("adding and planning it both changed something", all(r["changed"] for r in results), results)

    caught_up = api.meals(start)
    meals = {m["id"]: m for m in caught_up["meals"]}
    expect(
        "the catch-up has the meal, its ingredients in order",
        meals.get(meal_id, {}).get("ingredients") == ["Test onion", "Test rice"],
        meals.get(meal_id),
    )
    days = {d["date"]: d for d in caught_up["plan"]}
    planned = days.get(TEST_DATE, {})
    expect("the catch-up has the plan day", planned.get("meal_id") == meal_id, planned)
    again = api.send(added)
    expect(
        "sending the add again gets the same answer and changes nothing",
        again == results[:1] and api.meals(caught_up["seq"])["seq"] == caught_up["seq"],
        again,
    )

    api.send(op("unplan", date=TEST_DATE), op("remove_meal", meal_id=meal_id))
    after = api.meals(caught_up["seq"])
    expect(
        "unplanned and removed",
        any(d["date"] == TEST_DATE and d["meal_id"] is None for d in after["plan"])
        and any(m["id"] == meal_id and m["removed"] for m in after["meals"]),
        after,
    )
    print("All good." if failures == 0 else f"{failures} failed.")
    return failures


def main() -> None:
    who, command = (sys.argv[1:3] + ["", ""])[:2]
    if who not in ("member", "hub") or command not in ("list", "check"):
        sys.exit("Usage: meals.py member|hub list|check")
    tenant_id = setting("FAMILYHUB_ENTRA_TENANT_ID")
    authority = f"https://{setting('FAMILYHUB_ENTRA_SUBDOMAIN')}.ciamlogin.com/{tenant_id}"
    result = (member_token if who == "member" else hub_token)(authority, setting("FAMILYHUB_API_CLIENT_ID"))
    if "access_token" not in result:
        sys.exit(f"Signing in failed: {result.get('error')}: {result.get('error_description')}")
    api = Api(setting("FAMILYHUB_API_URL").rstrip("/"), result["access_token"])
    if command == "list":
        print(json.dumps(api.meals(), indent=2))
        return
    sys.exit(1 if check(api) else 0)


if __name__ == "__main__":
    main()

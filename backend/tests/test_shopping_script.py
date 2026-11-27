"""scripts/shopping.py clear, against the API with test_lists' stand-in for Cosmos DB."""

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from shopping import MOST_OPERATIONS, clear, op
from test_lists import Clock, FakeStore, items, send
from test_shops import add_shop
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts

from familyhub_api import lists
from familyhub_api.auth import TokenChecker
from familyhub_api.main import create_app


class InMemoryApi:
    """The script's Api, calling the app in memory instead of over HTTP, and counting each batch it sends."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.batches: list[int] = []

    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]:
        self.batches.append(len(operations))
        response = send(self.client, *operations)
        assert response.status_code == 200, response.text
        return response.json()["results"]

    def items(self, after: int = 0) -> dict[str, Any]:
        return items(self.client, after)


@pytest.fixture
def api() -> InMemoryApi:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return InMemoryApi(
        TestClient(create_app(checker=checker, accounts=accounts, store=FakeStore(), clock=Clock()))
    )


def add_items(api: InMemoryApi, count: int) -> None:
    for start in range(0, count, MOST_OPERATIONS):
        api.send(
            *(
                op("add", str(uuid4()), f"Test item {n}")
                for n in range(start, min(count, start + MOST_OPERATIONS))
            )
        )


def test_clear_removes_every_item_and_keeps_shops(api: InMemoryApi) -> None:
    add_items(api, 3)
    api.send(op("tick", api.items()["items"][0]["id"]))
    api.send(add_shop("Corner shop"))

    assert clear(api) == 3

    caught_up = api.items()
    assert [item for item in caught_up["items"] if not item["removed"]] == []
    assert [shop["name"] for shop in caught_up["shops"]] == ["Corner shop"]


def test_clear_again_removes_none(api: InMemoryApi) -> None:
    add_items(api, 2)
    clear(api)
    assert clear(api) == 0


def test_the_script_knows_the_api_s_batch_limit() -> None:
    assert lists.MOST_OPERATIONS == MOST_OPERATIONS


def test_clear_sends_at_most_a_full_batch_at_a_time(api: InMemoryApi) -> None:
    add_items(api, MOST_OPERATIONS + 5)
    api.batches.clear()
    assert clear(api) == MOST_OPERATIONS + 5
    assert api.batches == [MOST_OPERATIONS, 5]

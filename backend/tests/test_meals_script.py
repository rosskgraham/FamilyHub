"""scripts/meals.py check, against the API with test_lists' stand-in for Cosmos DB."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from meals import TEST_DATE, check
from test_lists import Clock, FakeStore
from test_sign_in import MEMBER_OID, SETTINGS, TENANT_KEY, FakeAccounts, hub_token

from familyhub_api.auth import TokenChecker
from familyhub_api.main import create_app


class InMemoryApi:
    """The script's Api, calling the app in memory instead of over HTTP, as the Hub."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.headers = {"Authorization": f"Bearer {hub_token()}"}

    def send(self, *operations: dict[str, Any]) -> list[dict[str, Any]]:
        body = {"operations": list(operations)}
        response = self.client.post("/meals/operations", json=body, headers=self.headers)
        assert response.status_code == 200, response.text
        return response.json()["results"]

    def meals(self, after: int = 0) -> dict[str, Any]:
        response = self.client.get("/meals", params={"after": after}, headers=self.headers)
        assert response.status_code == 200, response.text
        return response.json()


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def api(store: FakeStore) -> InMemoryApi:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return InMemoryApi(TestClient(create_app(checker=checker, accounts=accounts, store=store, clock=Clock())))


def test_check_passes_and_leaves_only_a_removed_meal_and_an_empty_day(
    api: InMemoryApi, capsys: pytest.CaptureFixture[str]
) -> None:
    assert check(api) == 0
    assert "All good." in capsys.readouterr().out
    assert api.meals() == {"meals": [], "plan": [], "seq": 4}


def test_check_plans_only_its_far_off_date() -> None:
    assert TEST_DATE == "2099-12-31"

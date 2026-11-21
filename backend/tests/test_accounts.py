"""The Household's accounts in Cosmos DB, with a stand-in for the container."""

from typing import Any

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from familyhub_api.accounts import CosmosAccounts


class FakeContainer:
    def __init__(self, items: dict[str, dict[str, Any]]) -> None:
        self._items = items
        self.reads: list[tuple[str, str]] = []

    def read_item(self, item: str, partition_key: str) -> dict[str, Any]:
        self.reads.append((item, partition_key))
        if item not in self._items:
            raise CosmosResourceNotFoundError(message="Not found")
        return self._items[item]


def test_an_account_on_the_list_is_its_member() -> None:
    container = FakeContainer({"oid-1": {"id": "oid-1", "memberId": "ross"}})

    assert CosmosAccounts(lambda: container).member_for("oid-1") == "ross"  # type: ignore[arg-type]
    # A point read, with the Object ID as the partition key.
    assert container.reads == [("oid-1", "oid-1")]


def test_an_account_not_on_the_list_is_no_one() -> None:
    assert CosmosAccounts(lambda: FakeContainer({})).member_for("oid-2") is None  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "item", [{"id": "oid-3"}, {"id": "oid-3", "memberId": ""}, {"id": "oid-3", "memberId": 7}]
)
def test_an_item_without_a_member_id_is_no_one(item: dict[str, Any]) -> None:
    assert CosmosAccounts(lambda: FakeContainer({"oid-3": item})).member_for("oid-3") is None  # type: ignore[arg-type]


def test_it_connects_once_on_first_use() -> None:
    connections: list[FakeContainer] = []

    def connect() -> FakeContainer:
        connections.append(FakeContainer({}))
        return connections[-1]

    accounts = CosmosAccounts(connect)  # type: ignore[arg-type]
    assert connections == []

    accounts.member_for("a")
    accounts.member_for("b")
    assert len(connections) == 1


def test_configured_cosmos_doesnt_connect_until_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    # Nothing listens here: connecting would fail, so making the app mustn't connect.
    monkeypatch.setenv("COSMOS_ENDPOINT", "https://localhost:1/")
    monkeypatch.setenv("COSMOS_DATABASE", "familyhub")

    assert CosmosAccounts.from_environment() is not None


def test_without_cosmos_settings_there_are_no_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("COSMOS_ENDPOINT", raising=False)
    monkeypatch.delenv("COSMOS_DATABASE", raising=False)

    assert CosmosAccounts.from_environment() is None

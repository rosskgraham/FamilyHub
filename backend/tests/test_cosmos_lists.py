"""The lists container in Cosmos DB, with a stand-in for the SDK's container."""

from typing import Any

import pytest
from azure.cosmos.exceptions import CosmosBatchOperationError, CosmosResourceNotFoundError

from familyhub_api.cosmos_lists import CosmosLists
from familyhub_api.lists import Clash, Write


class FakeContainer:
    def __init__(self) -> None:
        self.batches: list[tuple[list[Any], str]] = []
        self.queries: list[dict[str, Any]] = []
        self.batch_status: int | None = None

    def read_item(self, item: str, partition_key: str) -> dict[str, Any]:
        if item != "counter":
            raise CosmosResourceNotFoundError(message="Not found")
        return {"id": "counter", "listId": partition_key, "seq": 4, "_etag": "e1"}

    def execute_item_batch(self, batch_operations: list[Any], partition_key: str) -> list[Any]:
        if self.batch_status is not None:
            raise CosmosBatchOperationError(
                error_index=0, headers={}, status_code=self.batch_status, message="No", operation_responses=[]
            )
        self.batches.append((batch_operations, partition_key))
        return []

    def query_items(self, query: str, parameters: list[dict[str, Any]], partition_key: str) -> list[Any]:
        self.queries.append({"query": query, "parameters": parameters, "partition_key": partition_key})
        return [{"id": "item-1"}]


@pytest.fixture
def container() -> FakeContainer:
    return FakeContainer()


def partition(container: FakeContainer) -> Any:
    return CosmosLists(lambda: container).partition("shopping")  # type: ignore[arg-type, return-value]


def test_reads_are_point_reads_in_the_list_s_partition(container: FakeContainer) -> None:
    assert partition(container).read("counter")["seq"] == 4
    assert partition(container).read("item-x") is None


def test_writes_go_in_one_batch_creating_new_documents_and_replacing_only_unchanged_ones(
    container: FakeContainer,
) -> None:
    partition(container).commit(
        [
            Write({"id": "counter", "seq": 5, "_etag": "e1", "_rid": "r", "_ts": 1}, "e1"),
            Write({"id": "op-1", "seq": 5}, None),
        ]
    )

    [(operations, partition_key)] = container.batches
    assert partition_key == "shopping"
    assert operations == [
        # Cosmos DB's own fields aren't written back.
        ("replace", ("counter", {"id": "counter", "seq": 5}), {"if_match_etag": "e1"}),
        ("create", ({"id": "op-1", "seq": 5},)),
    ]


@pytest.mark.parametrize("status", [409, 412])
def test_a_document_that_exists_or_changed_is_a_clash(container: FakeContainer, status: int) -> None:
    container.batch_status = status

    with pytest.raises(Clash):
        partition(container).commit([Write({"id": "op-1"}, None)])


def test_any_other_batch_failure_is_passed_on(container: FakeContainer) -> None:
    container.batch_status = 429

    with pytest.raises(CosmosBatchOperationError):
        partition(container).commit([Write({"id": "op-1"}, None)])


def test_from_nothing_only_items_to_get_or_ticked_off_recently_are_read(
    container: FakeContainer,
) -> None:
    partition(container).items(0, "2026-11-22T08:50:00.000000Z")

    [query] = container.queries
    assert query["partition_key"] == "shopping"
    assert "c.removed = false" in query["query"]
    assert "c.tickedOffAt > @tickedOffSince" in query["query"]
    assert query["parameters"] == [{"name": "@tickedOffSince", "value": "2026-11-22T08:50:00.000000Z"}]


def test_after_a_number_every_item_changed_since_is_read(container: FakeContainer) -> None:
    assert partition(container).items(7, "ignored") == [{"id": "item-1"}]

    [query] = container.queries
    assert query["query"] == "SELECT * FROM c WHERE c.kind = 'item' AND c.seq > @after"
    assert query["parameters"] == [{"name": "@after", "value": 7}]


def test_it_connects_once(container: FakeContainer) -> None:
    connections = []

    def connect() -> FakeContainer:
        connections.append(1)
        return container

    lists = CosmosLists(connect)  # type: ignore[arg-type]
    lists.partition("shopping")
    lists.partition("shopping")

    assert len(connections) == 1


def test_shops_changed_since_a_number_are_read(container: FakeContainer) -> None:
    partition(container).shops(3)

    [query] = container.queries
    assert query["partition_key"] == "shopping"
    assert query["query"] == "SELECT * FROM c WHERE c.kind = 'shop' AND c.seq > @after"
    assert query["parameters"] == [{"name": "@after", "value": 3}]


def test_regulars_read_the_recent_log_every_dont_suggest_and_the_list_in_one_query(
    container: FakeContainer,
) -> None:
    partition(container).history("2026-08-30T09:00:00.000000Z", "2026-11-22T08:50:00.000000Z")

    [query] = container.queries
    assert query["partition_key"] == "shopping"
    assert "c.at >= @since AND IS_DEFINED(c.itemId)" in query["query"]
    assert "c.type = 'dont_suggest'" in query["query"]
    assert "c.tickedOffAt > @shownSince" in query["query"]
    assert query["parameters"] == [
        {"name": "@since", "value": "2026-08-30T09:00:00.000000Z"},
        {"name": "@shownSince", "value": "2026-11-22T08:50:00.000000Z"},
    ]


def test_meals_and_plan_days_changed_since_a_number_are_read_by_kind(container: FakeContainer) -> None:
    partition(container).changed("meal", 4)

    [query] = container.queries
    assert query["partition_key"] == "shopping"
    assert query["query"] == "SELECT * FROM c WHERE c.kind = @kind AND c.seq > @after"
    assert query["parameters"] == [{"name": "@kind", "value": "meal"}, {"name": "@after", "value": 4}]

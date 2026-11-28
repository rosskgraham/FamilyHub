"""The shared lists in Cosmos DB's lists container: one partition per list, keyed by /listId.

A list's counter, items, shops and log of operations are all in its partition, so they can be written together
in a transactional batch. The counter is replaced only if its etag is unchanged, and an operation is created
only if it doesn't exist yet, so two requests can never take the same sequence number.
"""

import os
from collections.abc import Callable, Sequence
from typing import Any

from azure.cosmos import ContainerProxy, CosmosClient
from azure.cosmos.exceptions import CosmosBatchOperationError, CosmosResourceNotFoundError
from azure.identity import DefaultAzureCredential

from familyhub_api.lists import Clash, Write

CONTAINER = "lists"

# Cosmos DB's own fields, which aren't written back.
_SYSTEM_FIELDS = ("_rid", "_self", "_etag", "_attachments", "_ts")


class CosmosLists:
    """The lists container, connecting the first time it's asked, so a problem reaching Cosmos DB fails that
    request, not the app's start."""

    def __init__(self, connect: Callable[[], ContainerProxy]) -> None:
        self._connect = connect
        self._container: ContainerProxy | None = None

    @classmethod
    def from_environment(cls) -> "CosmosLists | None":
        """Signs in to Cosmos DB with the function app's managed identity. None when it isn't configured, as
        on the PC."""
        endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
        database = os.environ.get("COSMOS_DATABASE", "").strip()
        if not endpoint or not database:
            return None

        def connect() -> ContainerProxy:
            client = CosmosClient(endpoint, credential=DefaultAzureCredential())
            return client.get_database_client(database).get_container_client(CONTAINER)

        return cls(connect)

    def partition(self, list_id: str) -> "CosmosPartition":
        if self._container is None:
            self._container = self._connect()
        return CosmosPartition(self._container, list_id)


class CosmosPartition:
    def __init__(self, container: ContainerProxy, list_id: str) -> None:
        self._container = container
        self._list_id = list_id

    def read(self, doc_id: str) -> dict[str, Any] | None:
        try:
            return self._container.read_item(item=doc_id, partition_key=self._list_id)
        except CosmosResourceNotFoundError:
            return None

    def commit(self, writes: Sequence[Write]) -> None:
        operations: list[Any] = []
        for write in writes:
            doc = {key: value for key, value in write.doc.items() if key not in _SYSTEM_FIELDS}
            if write.etag is None:
                operations.append(("create", (doc,)))
            else:
                operations.append(("replace", (doc["id"], doc), {"if_match_etag": write.etag}))
        try:
            self._container.execute_item_batch(batch_operations=operations, partition_key=self._list_id)
        except CosmosBatchOperationError as error:
            # 409: something being created already exists. 412: something being replaced has changed.
            if error.status_code in (409, 412):
                raise Clash from error
            raise

    def items(self, after: int, ticked_off_since: str) -> list[dict[str, Any]]:
        if after > 0:
            query = "SELECT * FROM c WHERE c.kind = 'item' AND c.seq > @after"
            parameters: list[dict[str, Any]] = [{"name": "@after", "value": after}]
        else:
            # Starting from nothing: only what's still to get, or was ticked off recently, so the read doesn't
            # grow with every item ever bought.
            query = (
                "SELECT * FROM c WHERE c.kind = 'item' AND c.removed = false"
                " AND (c.tickedOff = false OR c.tickedOffAt > @tickedOffSince)"
            )
            parameters = [{"name": "@tickedOffSince", "value": ticked_off_since}]
        return list(
            self._container.query_items(query=query, parameters=parameters, partition_key=self._list_id)
        )

    def history(self, since: str, shown_since: str) -> list[dict[str, Any]]:
        # One query for regulars (#109): the items' operations in the last few weeks, every dont_suggest, and
        # what's on the list now. Shops' operations aren't needed.
        query = (
            "SELECT * FROM c WHERE (c.kind = 'op' AND c.changed = true"
            " AND ((c.at >= @since AND IS_DEFINED(c.itemId)) OR c.type = 'dont_suggest'))"
            " OR (c.kind = 'item' AND c.removed = false"
            " AND (c.tickedOff = false OR c.tickedOffAt > @shownSince))"
        )
        parameters: list[dict[str, Any]] = [
            {"name": "@since", "value": since},
            {"name": "@shownSince", "value": shown_since},
        ]
        return list(
            self._container.query_items(query=query, parameters=parameters, partition_key=self._list_id)
        )

    def changed(self, kind: str, after: int) -> list[dict[str, Any]]:
        # Meals and plan days (#97), each of its kind.
        query = "SELECT * FROM c WHERE c.kind = @kind AND c.seq > @after"
        parameters: list[dict[str, Any]] = [
            {"name": "@kind", "value": kind},
            {"name": "@after", "value": after},
        ]
        return list(
            self._container.query_items(query=query, parameters=parameters, partition_key=self._list_id)
        )

    def shops(self, after: int) -> list[dict[str, Any]]:
        query = "SELECT * FROM c WHERE c.kind = 'shop' AND c.seq > @after"
        parameters: list[dict[str, Any]] = [{"name": "@after", "value": after}]
        return list(
            self._container.query_items(query=query, parameters=parameters, partition_key=self._list_id)
        )

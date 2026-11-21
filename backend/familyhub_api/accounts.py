"""The Household's accounts, in Cosmos DB's accounts container (ADR 0014).

One item per account that's allowed in: its id is the account's Object ID in the FamilyHub tenant, which is
also the partition key, and memberId is the Member's id on the Hub. Items are added by hand, as the sign-in
runbook says.
"""

import os
from collections.abc import Callable

from azure.cosmos import ContainerProxy, CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from azure.identity import DefaultAzureCredential

CONTAINER = "accounts"


class CosmosAccounts:
    """Reads the accounts container, connecting the first time it's asked, so a problem reaching Cosmos DB
    fails that request, not the app's start, and /health still answers."""

    def __init__(self, connect: Callable[[], ContainerProxy]) -> None:
        self._connect = connect
        self._container: ContainerProxy | None = None

    @classmethod
    def from_environment(cls) -> "CosmosAccounts | None":
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

    def member_for(self, object_id: str) -> str | None:
        if self._container is None:
            self._container = self._connect()
        # A point read: 1 RU, and a change to the list counts from the next request.
        try:
            item = self._container.read_item(item=object_id, partition_key=object_id)
        except CosmosResourceNotFoundError:
            return None
        member_id = item.get("memberId")
        return member_id if isinstance(member_id, str) and member_id else None

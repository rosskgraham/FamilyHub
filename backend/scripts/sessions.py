"""Lists and ends phones' sessions: the session items in Cosmos DB's sessions container (ADR 0016), for a
lost or replaced phone.

    uv run python scripts/sessions.py list [member id]
    uv run python scripts/sessions.py end <session>
    uv run python scripts/sessions.py end-all <member id>

A session is named by the first characters of its id, as list shows them: the id is the token's hash, so it
can't be used to sign in. An ended session's phone gets a 401 on its next call, and asks to sign in again.

It signs in to Cosmos DB through the Azure CLI, as Ross, with the data role Bicep gives him. It reads:

    FAMILYHUB_COSMOS_ENDPOINT    the Cosmos DB account, such as https://cosmos-familyhub-xxxxxx.documents.azure.com:443/
"""

import sys
from typing import Any, Protocol

from whoami import setting

DATABASE = "familyhub"
CONTAINER = "sessions"
# Enough of the hash to tell sessions apart, and to name one.
SHOWN = 12


class Container(Protocol):
    def query_items(self, query: str, parameters: list[dict[str, Any]], **kwargs: Any) -> Any: ...
    def delete_item(self, item: str, partition_key: str) -> Any: ...


def sessions_of(container: Container, member_id: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM c WHERE c.kind = 'session'"
    parameters: list[dict[str, Any]] = []
    if member_id is not None:
        query += " AND c.memberId = @memberId"
        parameters.append({"name": "@memberId", "value": member_id})
    found = container.query_items(query=query, parameters=parameters, enable_cross_partition_query=True)
    return sorted(found, key=lambda session: (str(session.get("memberId")), str(session.get("created"))))


def list_sessions(container: Container, member_id: str | None = None) -> list[str]:
    lines = [
        f"{session.get('memberId')}\t{session['id'][:SHOWN]}\t{session.get('email')}"
        f"\tsigned in {session.get('created')}\tlast checked {session.get('checked')}"
        for session in sessions_of(container, member_id)
    ]
    return lines or ["No sessions."]


def end(container: Container, prefix: str) -> str:
    if len(prefix) < 8:
        sys.exit("Give at least 8 characters of the session, as list shows it.")
    found = [session for session in sessions_of(container) if session["id"].startswith(prefix.lower())]
    if not found:
        sys.exit(f"No session starts {prefix}.")
    if len(found) > 1:
        sys.exit(f"More than one session starts {prefix}. Give more of it.")
    container.delete_item(item=found[0]["id"], partition_key=found[0]["id"])
    return f"Ended {prefix}, {found[0].get('memberId')}'s. That phone asks to sign in again on its next call."


def end_all(container: Container, member_id: str) -> str:
    found = sessions_of(container, member_id)
    for session in found:
        container.delete_item(item=session["id"], partition_key=session["id"])
    return f"Ended {len(found)} of {member_id}'s sessions."


def main() -> None:
    from azure.cosmos import CosmosClient
    from azure.identity import AzureCliCredential

    command, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    allowed = {"list": (0, 1), "end": (1,), "end-all": (1,)}
    if len(args) not in allowed.get(command, ()):
        sys.exit("Usage: sessions.py list [member id] | end <session> | end-all <member id>")

    client = CosmosClient(setting("FAMILYHUB_COSMOS_ENDPOINT"), credential=AzureCliCredential())
    container = client.get_database_client(DATABASE).get_container_client(CONTAINER)

    if command == "list":
        print("\n".join(list_sessions(container, *args)))
    elif command == "end":
        print(end(container, *args))
    else:
        print(end_all(container, *args))


if __name__ == "__main__":
    main()

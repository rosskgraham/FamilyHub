"""Lists, adds and removes the Household's accounts: the items in Cosmos DB's accounts container (ADR 0014).

    uv run python scripts/accounts.py list
    uv run python scripts/accounts.py add <email address or Object ID> <member id>
    uv run python scripts/accounts.py remove <email address or Object ID>

add finds the account in the FamilyHub tenant by the email address of its Google sign-in, so the account has
to have signed in once first (the sign-in runbook, step 8). The member id is the Member's id on the Hub,
which the script can't check: the runbook says how to find it on the Pi.

It signs in through the Azure CLI, as Ross: to Cosmos DB in Ross's usual directory, with the data role Bicep
gives him, and to Microsoft Graph in the FamilyHub tenant, where he's an administrator. Run
`az login --tenant <the FamilyHub tenant's ID> --allow-no-subscriptions` once if it can't get a token there.
It reads these environment variables:

    FAMILYHUB_COSMOS_ENDPOINT    the Cosmos DB account, such as https://cosmos-familyhub-xxxxxx.documents.azure.com:443/
    FAMILYHUB_ENTRA_TENANT_ID    the FamilyHub tenant's ID
"""

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol

from azure.cosmos.exceptions import CosmosResourceExistsError, CosmosResourceNotFoundError
from whoami import setting

DATABASE = "familyhub"
CONTAINER = "accounts"
OBJECT_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


class Container(Protocol):
    def read_all_items(self) -> Any: ...
    def create_item(self, body: dict[str, Any]) -> Any: ...
    def delete_item(self, item: str, partition_key: str) -> Any: ...


class Directory(Protocol):
    def google_accounts(self, email: str) -> list[str]:
        """The Object IDs of the users who sign in with Google as this address."""
        ...

    def email_of(self, object_id: str) -> str | None:
        """The user's email address, or None if the tenant has no such user."""
        ...


class GraphDirectory:
    """The FamilyHub tenant's users, through Microsoft Graph."""

    def __init__(self, access_token: str) -> None:
        self._headers = {"Authorization": f"Bearer {access_token}"}

    def _get(self, path: str) -> dict[str, Any] | None:
        request = urllib.request.Request(f"https://graph.microsoft.com/v1.0{path}", headers=self._headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            sys.exit(f"Microsoft Graph said {error.code}: {error.read().decode(errors='replace')}")

    def google_accounts(self, email: str) -> list[str]:
        # Only Google sign-ins: Ross's administrator account has the same address in otherMails.
        address = email.replace("'", "''")
        query = urllib.parse.urlencode({"$filter": f"mail eq '{address}'", "$select": "id,identities"})
        users = (self._get(f"/users?{query}") or {}).get("value", [])
        return [
            user["id"]
            for user in users
            if any(identity.get("issuer") == "google.com" for identity in user.get("identities", []))
        ]

    def email_of(self, object_id: str) -> str | None:
        user = self._get(f"/users/{object_id}?$select=mail,otherMails")
        if user is None:
            return None
        return user.get("mail") or next(iter(user.get("otherMails") or []), "") or "(no email address)"


def object_id_for(directory: Directory, who: str) -> str:
    if OBJECT_ID.match(who):
        object_id = who.lower()
        if directory.email_of(object_id) is None:
            sys.exit(f"The FamilyHub tenant has no user with the Object ID {object_id}.")
        return object_id
    found = directory.google_accounts(who)
    if not found:
        sys.exit(
            f"No one has signed in with Google as {who} yet. Sign in once as them first, with the family app "
            "or scripts/whoami.py member, then try again."
        )
    if len(found) > 1:
        sys.exit(f"More than one user signs in as {who}: {', '.join(found)}. Add the right one by Object ID.")
    return found[0]


def list_accounts(container: Container, directory: Directory) -> list[str]:
    lines = []
    for item in sorted(container.read_all_items(), key=lambda item: str(item.get("memberId"))):
        email = directory.email_of(item["id"]) or "(not in the FamilyHub tenant)"
        lines.append(f"{item.get('memberId')}\t{item['id']}\t{email}")
    return lines or ["No accounts are on the list."]


def add(container: Container, directory: Directory, who: str, member_id: str) -> str:
    object_id = object_id_for(directory, who)
    try:
        container.create_item({"id": object_id, "memberId": member_id})
    except CosmosResourceExistsError:
        sys.exit(f"{object_id} is already on the list. Remove it first to point it at another Member.")
    return f"Added {object_id} as {member_id}. It counts from the account's next request."


def remove(container: Container, directory: Directory, who: str) -> str:
    # An Object ID is taken as given, so an item left behind by a user deleted from the tenant can go too.
    object_id = who.lower() if OBJECT_ID.match(who) else object_id_for(directory, who)
    try:
        container.delete_item(item=object_id, partition_key=object_id)
    except CosmosResourceNotFoundError:
        sys.exit(f"{object_id} isn't on the list.")
    return f"Removed {object_id}. It counts from the account's next request."


def main() -> None:
    from azure.cosmos import CosmosClient
    from azure.identity import AzureCliCredential

    command, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    expected = {"list": 0, "add": 2, "remove": 1}
    if expected.get(command) != len(args):
        sys.exit(
            "Usage: accounts.py list | add <email or Object ID> <member id> | remove <email or Object ID>"
        )

    tenant_id = setting("FAMILYHUB_ENTRA_TENANT_ID")
    graph_token = AzureCliCredential(tenant_id=tenant_id).get_token("https://graph.microsoft.com/.default")
    directory = GraphDirectory(graph_token.token)
    client = CosmosClient(setting("FAMILYHUB_COSMOS_ENDPOINT"), credential=AzureCliCredential())
    container = client.get_database_client(DATABASE).get_container_client(CONTAINER)

    if command == "list":
        print("\n".join(list_accounts(container, directory)))
    elif command == "add":
        print(add(container, directory, *args))
    else:
        print(remove(container, directory, *args))


if __name__ == "__main__":
    main()

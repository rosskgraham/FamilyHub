"""scripts/accounts.py, with stand-ins for the accounts container and the FamilyHub tenant."""

from typing import Any

import pytest
from accounts import add, list_accounts, remove
from azure.cosmos.exceptions import CosmosResourceExistsError, CosmosResourceNotFoundError

ROSS = "1a2b3c4d-0000-4000-8000-000000000000"
NEW = "1a2b3c4d-0000-4000-8000-000000000001"
OTHER = "1a2b3c4d-0000-4000-8000-000000000002"


class FakeContainer:
    def __init__(self, items: dict[str, dict[str, Any]]) -> None:
        self.items = items

    def read_all_items(self) -> list[dict[str, Any]]:
        return list(self.items.values())

    def create_item(self, body: dict[str, Any]) -> None:
        if body["id"] in self.items:
            raise CosmosResourceExistsError(message="Conflict")
        self.items[body["id"]] = body

    def delete_item(self, item: str, partition_key: str) -> None:
        assert item == partition_key
        if item not in self.items:
            raise CosmosResourceNotFoundError(message="Not found")
        del self.items[item]


class FakeDirectory:
    def __init__(self, google: dict[str, list[str]], emails: dict[str, str]) -> None:
        self._google = google
        self._emails = emails

    def google_accounts(self, email: str) -> list[str]:
        return self._google.get(email, [])

    def email_of(self, object_id: str) -> str | None:
        return self._emails.get(object_id)


def directory() -> FakeDirectory:
    return FakeDirectory(
        {"ross@example.com": [ROSS], "new@example.com": [NEW], "twice@example.com": [NEW, OTHER]},
        {ROSS: "ross@example.com", NEW: "new@example.com", OTHER: "twice@example.com"},
    )


def test_add_finds_the_account_by_its_google_address() -> None:
    container = FakeContainer({})

    message = add(container, directory(), "new@example.com", "sam")

    assert container.items == {NEW: {"id": NEW, "memberId": "sam"}}
    assert NEW in message and "sam" in message


def test_add_takes_an_object_id_as_given() -> None:
    container = FakeContainer({})

    add(container, directory(), NEW.upper(), "sam")

    assert container.items == {NEW: {"id": NEW, "memberId": "sam"}}


@pytest.mark.parametrize(
    "who, why",
    [
        ("nobody@example.com", "No one has signed in with Google as nobody@example.com"),
        ("twice@example.com", "More than one user"),
        ("9f9f9f9f-0000-4000-8000-000000000000", "no user with the Object ID"),
        ("ross@example.com", "already on the list"),
    ],
)
def test_add_refuses(who: str, why: str) -> None:
    container = FakeContainer({ROSS: {"id": ROSS, "memberId": "ross"}})

    with pytest.raises(SystemExit, match=why):
        add(container, directory(), who, "sam")
    assert container.items == {ROSS: {"id": ROSS, "memberId": "ross"}}


def test_remove_deletes_the_accounts_item() -> None:
    container = FakeContainer({ROSS: {"id": ROSS, "memberId": "ross"}, NEW: {"id": NEW, "memberId": "sam"}})

    remove(container, directory(), "new@example.com")

    assert list(container.items) == [ROSS]


def test_remove_takes_an_object_id_even_when_the_tenant_no_longer_has_the_user() -> None:
    gone = "9f9f9f9f-0000-4000-8000-000000000000"
    container = FakeContainer({gone: {"id": gone, "memberId": "sam"}})

    remove(container, directory(), gone)

    assert container.items == {}


def test_remove_says_when_the_account_isnt_on_the_list() -> None:
    with pytest.raises(SystemExit, match="isn't on the list"):
        remove(FakeContainer({}), directory(), "new@example.com")


def test_list_shows_each_member_object_id_and_email() -> None:
    gone = "9f9f9f9f-0000-4000-8000-000000000000"
    container = FakeContainer({ROSS: {"id": ROSS, "memberId": "ross"}, gone: {"id": gone, "memberId": "sam"}})

    assert list_accounts(container, directory()) == [
        f"ross\t{ROSS}\tross@example.com",
        f"sam\t{gone}\t(not in the FamilyHub tenant)",
    ]


def test_list_says_when_the_list_is_empty() -> None:
    assert list_accounts(FakeContainer({}), directory()) == ["No accounts are on the list."]

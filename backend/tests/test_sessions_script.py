"""scripts/sessions.py, with a stand-in for the sessions container."""

from typing import Any

import pytest
from sessions import end, end_all, list_sessions

ROSS_PHONE = "a1" * 32
ROSS_OLD_PHONE = "a2" * 32
SAM_PHONE = "b1" * 32


class FakeContainer:
    def __init__(self, items: list[dict[str, Any]]) -> None:
        self.items = {item["id"]: item for item in items}

    def query_items(
        self, query: str, parameters: list[dict[str, Any]], **kwargs: Any
    ) -> list[dict[str, Any]]:
        assert kwargs["enable_cross_partition_query"] is True
        found = [item for item in self.items.values() if item["kind"] == "session"]
        for parameter in parameters:
            assert parameter["name"] == "@memberId"
            found = [item for item in found if item["memberId"] == parameter["value"]]
        return found

    def delete_item(self, item: str, partition_key: str) -> None:
        assert item == partition_key
        del self.items[item]


def session(item_id: str, member_id: str, created: str) -> dict[str, Any]:
    return {
        "id": item_id,
        "kind": "session",
        "memberId": member_id,
        "email": f"{member_id}@example.com",
        "created": created,
        "checked": created,
        "cache": "secret tokens",
    }


def container() -> FakeContainer:
    return FakeContainer(
        [
            session(SAM_PHONE, "sam", "2026-11-20"),
            session(ROSS_PHONE, "ross", "2026-11-25"),
            session(ROSS_OLD_PHONE, "ross", "2026-09-01"),
            {"id": "c" * 64, "kind": "code", "memberId": "ross"},
        ]
    )


def test_list_shows_each_session_without_its_tokens() -> None:
    lines = list_sessions(container())

    assert lines == [
        f"ross\t{ROSS_OLD_PHONE[:12]}\tross@example.com\tsigned in 2026-09-01\tlast checked 2026-09-01",
        f"ross\t{ROSS_PHONE[:12]}\tross@example.com\tsigned in 2026-11-25\tlast checked 2026-11-25",
        f"sam\t{SAM_PHONE[:12]}\tsam@example.com\tsigned in 2026-11-20\tlast checked 2026-11-20",
    ]
    assert "secret" not in "".join(lines)


def test_list_can_show_one_members_sessions() -> None:
    assert len(list_sessions(container(), "sam")) == 1


def test_list_says_when_there_are_none() -> None:
    assert list_sessions(FakeContainer([])) == ["No sessions."]


def test_end_ends_the_one_session_it_names() -> None:
    sessions = container()

    message = end(sessions, ROSS_OLD_PHONE[:12])

    assert ROSS_OLD_PHONE not in sessions.items
    assert ROSS_PHONE in sessions.items
    assert "ross" in message


@pytest.mark.parametrize(
    "prefix, why",
    [("a1a1", "at least 8"), ("ffffffff", "No session"), ("a1a1a1a1", None)],
)
def test_end_refuses_what_isnt_one_session(prefix: str, why: str | None) -> None:
    sessions = FakeContainer([session(ROSS_PHONE, "ross", "1"), session("a1a1a1a1" + "f" * 56, "ross", "2")])

    with pytest.raises(SystemExit, match=why or "More than one"):
        end(sessions, prefix)
    assert len(sessions.items) == 2


def test_end_all_ends_a_members_sessions_and_no_one_elses() -> None:
    sessions = container()

    assert end_all(sessions, "ross") == "Ended 2 of ross's sessions."
    assert SAM_PHONE in sessions.items
    assert ROSS_PHONE not in sessions.items and ROSS_OLD_PHONE not in sessions.items

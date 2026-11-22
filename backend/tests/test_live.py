"""Live updates: GET /live, and the message after a batch that changed something, with a stand-in for Web
PubSub."""

import logging
from typing import Any
from uuid import uuid4

import pytest
from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi.testclient import TestClient
from test_lists import Clock, FakeStore, add, op, send
from test_sign_in import MEMBER_OID, SETTINGS, STRANGER_OID, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.live import HUB, TOKEN_MINUTES, WebPubSubLive
from familyhub_api.main import create_app


class FakeLive:
    def __init__(self) -> None:
        self.messages: list[tuple[str, int]] = []
        self.fail = False

    def client_url(self) -> str:
        if self.fail:
            raise RuntimeError("Web PubSub is down")
        return "wss://wps.example/client/hubs/familyhub?access_token=t"

    def changed(self, list_id: str, seq: int) -> None:
        if self.fail:
            raise TimeoutError("Web PubSub took too long")
        self.messages.append((list_id, seq))


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def live() -> FakeLive:
    return FakeLive()


def make_client(store: FakeStore, live: FakeLive | None) -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    accounts = FakeAccounts({MEMBER_OID: "ross"})
    return TestClient(create_app(checker=checker, accounts=accounts, store=store, live=live, clock=Clock()))


@pytest.fixture
def client(store: FakeStore, live: FakeLive) -> TestClient:
    return make_client(store, live)


def connect(client: TestClient, bearer: str | None) -> Any:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer is not None else {}
    return client.get("/live", headers=headers)


@pytest.mark.parametrize("bearer", [token(), hub_token()], ids=["member", "hub"])
def test_a_member_or_the_hub_gets_a_url_to_connect_to(client: TestClient, bearer: str) -> None:
    response = connect(client, bearer)

    assert response.status_code == 200
    assert response.json() == {"url": "wss://wps.example/client/hubs/familyhub?access_token=t"}


def test_live_updates_need_sign_in(client: TestClient) -> None:
    assert connect(client, None).status_code == 401
    assert connect(client, token(oid=STRANGER_OID)).status_code == 403


def test_without_web_pubsub_live_updates_are_a_503(store: FakeStore) -> None:
    assert connect(make_client(store, None), token()).status_code == 503


def test_web_pubsub_failing_to_give_a_url_is_a_503(client: TestClient, live: FakeLive) -> None:
    live.fail = True

    assert connect(client, token()).status_code == 503


def test_a_batch_that_changed_something_sends_one_message_with_its_highest_number(
    client: TestClient, live: FakeLive
) -> None:
    item_id = str(uuid4())

    send(client, add("Milk", item_id), op("tick", item_id), op("rename", item_id, "Oat milk"))

    assert live.messages == [("shopping", 3)]


def test_the_highest_number_that_changed_something_is_sent(client: TestClient, live: FakeLive) -> None:
    item_id = str(uuid4())

    # The untick changes nothing, as the item isn't ticked off, but still takes number 2.
    send(client, add("Milk", item_id), op("untick", item_id))

    assert live.messages == [("shopping", 1)]


def test_a_batch_that_changed_nothing_sends_nothing(client: TestClient, live: FakeLive) -> None:
    send(client, op("tick", str(uuid4())))

    assert live.messages == []


def test_a_resend_sends_nothing(client: TestClient, live: FakeLive) -> None:
    milk = add("Milk")
    send(client, milk)

    again = send(client, milk)

    assert again.json()["results"][0]["changed"] is True
    assert live.messages == [("shopping", 1)]


def test_a_failed_message_does_not_fail_the_save(
    client: TestClient, live: FakeLive, store: FakeStore, caplog: pytest.LogCaptureFixture
) -> None:
    live.fail = True

    with caplog.at_level(logging.WARNING):
        response = send(client, add("Secret jam"))

    assert response.status_code == 200
    assert len(store.shopping.log()) == 1
    assert "Couldn't tell clients the shopping list changed, up to 1." in caplog.text
    assert "Secret jam" not in caplog.text


def test_a_batch_that_fails_partway_still_tells_clients_what_it_saved(
    client: TestClient, live: FakeLive, store: FakeStore
) -> None:
    real_read = store.shopping.read
    reads = []

    def read_then_fail(doc_id: str) -> Any:
        reads.append(doc_id)
        # Each operation reads 3 documents: the first operation goes through, the second fails.
        if len(reads) > 3:
            raise CosmosHttpResponseError(status_code=429, message="Too many requests")
        return real_read(doc_id)

    store.shopping.read = read_then_fail  # type: ignore[method-assign]

    response = send(client, add("Milk"), add("Bread"))

    assert response.status_code == 503
    assert live.messages == [("shopping", 1)]


class FakeService:
    def __init__(self) -> None:
        self.sent: list[tuple[Any, str | None]] = []
        self.token_minutes: int | None = None

    def get_client_access_token(self, *, minutes_to_expire: int) -> dict[str, str]:
        self.token_minutes = minutes_to_expire
        return {"url": "wss://wps.example/client/hubs/familyhub?access_token=t", "token": "t"}

    def send_to_all(self, message: Any, *, content_type: str | None = None) -> None:
        self.sent.append((message, content_type))


def test_web_pubsub_gets_a_60_minute_token_and_a_json_message() -> None:
    service = FakeService()
    live = WebPubSubLive("https://wps.example")
    live._client = service  # type: ignore[assignment]

    assert live.client_url().startswith("wss://")
    live.changed("shopping", 7)

    assert service.token_minutes == TOKEN_MINUTES == 60
    assert service.sent == [({"list": "shopping", "seq": 7}, "application/json")]


def test_web_pubsub_is_configured_from_its_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("WEBPUBSUB_ENDPOINT", raising=False)
    assert WebPubSubLive.from_environment() is None

    monkeypatch.setenv("WEBPUBSUB_ENDPOINT", "https://wps.example")
    assert WebPubSubLive.from_environment() is not None
    assert HUB == "familyhub"

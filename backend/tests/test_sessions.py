"""Sign-in held by the backend (ADR 0016): the routes, with stand-ins for the tenant, Cosmos and a clock."""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from fastapi.testclient import TestClient
from test_sign_in import MEMBER_OID, SETTINGS, STRANGER_OID, TENANT_KEY, FakeAccounts, hub_token, token

from familyhub_api.auth import TokenChecker
from familyhub_api.main import create_app
from familyhub_api.sessions import Account, CosmosStore, Sessions, sessions_from_environment

APP = "https://lively-beach-0.azurestaticapps.net"
DEV = "http://localhost:5173"
API = "https://func-familyhub-test.azurewebsites.net"


class FakeEntra:
    """The tenant: each flow gets the next state, and each code names the account it signs in."""

    def __init__(self) -> None:
        self.started: list[str] = []
        self.refusing = False
        self.unreachable = False
        self.refreshed: list[str] = []
        self.failing = False

    def start(self, redirect_uri: str) -> dict[str, Any]:
        self.started.append(redirect_uri)
        state = f"state-{len(self.started)}"
        return {
            "state": state,
            "auth_uri": f"https://tenant.example/authorize?state={state}",
            "verifier": "v",
        }

    def finish(self, flow: dict[str, Any], response: dict[str, str]) -> Account:
        if self.failing:
            raise RuntimeError("The token endpoint is down.")
        assert flow["state"] == response["state"]
        object_id = response["code"]
        return Account(
            object_id=object_id,
            email=f"{object_id}@gmail.example",
            cache=f"cache-{object_id}",
            name="Ross Graham",
            given_name="Ross",
        )

    def refresh(self, cache: str) -> str | None:
        if self.unreachable:
            raise ConnectionError("Entra can't be reached.")
        self.refreshed.append(cache)
        return None if self.refusing else cache + "+"


class MemoryStore:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.writes = 0

    def get(self, item_id: str) -> dict[str, Any] | None:
        item = self.items.get(item_id)
        return dict(item) if item else None

    def put(self, item: dict[str, Any]) -> None:
        assert "ttl" in item
        self.writes += 1
        self.items[item["id"]] = dict(item)

    def delete(self, item_id: str) -> bool:
        return self.items.pop(item_id, None) is not None

    def of_kind(self, kind: str) -> list[dict[str, Any]]:
        return [item for item in self.items.values() if item["kind"] == kind]


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


class World:
    def __init__(self) -> None:
        self.entra = FakeEntra()
        self.store = MemoryStore()
        self.accounts = FakeAccounts({MEMBER_OID: "ross"})
        self.clock = Clock()
        sessions = Sessions(self.entra, self.store, self.accounts, self.clock)
        checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
        app = create_app(
            checker=checker,
            accounts=self.accounts,
            sessions=sessions,
            app_origins=[APP, DEV],
            public_url=API,
        )
        self.client = TestClient(app, follow_redirects=False)

    def start(self, return_to: str = APP) -> str:
        """Starts signing in, and gives the state the tenant would send back."""
        response = self.client.get("/auth/sign-in", params={"return_to": return_to})
        assert response.status_code == 302
        return parse_qs(urlsplit(response.headers["location"]).query)["state"][0]

    def come_back(self, state: str, **form: str) -> str:
        """The tenant posts back to the callback; gives where the browser goes next."""
        response = self.client.post("/auth/callback", data={"state": state, **form})
        assert response.status_code == 303
        return response.headers["location"]

    def code(self, object_id: str = MEMBER_OID) -> str:
        location = self.come_back(self.start(), code=object_id)
        return parse_qs(urlsplit(location).query)["code"][0]

    def swap(self, code: str) -> Any:
        return self.client.post("/auth/session", json={"code": code})

    def session(self) -> str:
        return self.swap(self.code()).json()["token"]

    def me(self, bearer: str) -> Any:
        return self.client.get("/me", headers={"Authorization": f"Bearer {bearer}"})


@pytest.fixture
def world() -> World:
    return World()


def test_signing_in_starts_at_the_tenant_and_comes_back_to_the_api(world: World) -> None:
    response = world.client.get("/auth/sign-in", params={"return_to": APP})

    assert response.status_code == 302
    assert response.headers["location"] == "https://tenant.example/authorize?state=state-1"
    assert world.entra.started == [f"{API}/auth/callback"]
    # The flow is kept for 10 minutes, keyed by its state's hash.
    [flow] = world.store.of_kind("flow")
    assert flow["ttl"] == 600
    assert "state-1" not in flow["id"]


@pytest.mark.parametrize("return_to", ["https://evil.example", f"{APP}.evil", f"{APP}/", ""])
def test_signing_in_returns_only_to_the_family_app(world: World, return_to: str) -> None:
    response = world.client.get("/auth/sign-in", params={"return_to": return_to})

    assert response.status_code == 400
    assert world.entra.started == []


def test_the_dev_server_may_sign_in_too(world: World) -> None:
    location = world.come_back(world.start(DEV), code=MEMBER_OID)

    assert location.startswith(f"{DEV}/auth/done?code=")


def test_coming_back_goes_to_the_family_app_with_a_one_time_code(world: World) -> None:
    location = world.come_back(world.start(), code=MEMBER_OID)

    assert location.startswith(f"{APP}/auth/done?code=")
    # The flow is used up, and the code is kept for 2 minutes, by its hash.
    assert world.store.of_kind("flow") == []
    [code] = world.store.of_kind("code")
    assert code["ttl"] == 120
    one_time = parse_qs(urlsplit(location).query)["code"][0]
    assert code["id"] == hashlib.sha256(one_time.encode()).hexdigest()


def test_the_tenant_can_come_back_in_the_query_too(world: World) -> None:
    response = world.client.get("/auth/callback", params={"state": world.start(), "code": MEMBER_OID})

    assert response.status_code == 303
    assert response.headers["location"].startswith(f"{APP}/auth/done?code=")


def test_cancelling_at_the_account_choice_goes_back_with_the_error(world: World) -> None:
    location = world.come_back(world.start(), error="access_denied", error_description="The user cancelled.")

    assert location == f"{APP}/auth/done?error=access_denied"
    assert world.store.items == {}


def test_a_failure_redeeming_the_code_goes_back_as_failed(world: World) -> None:
    world.entra.failing = True

    assert world.come_back(world.start(), code=MEMBER_OID) == f"{APP}/auth/done?error=failed"


@pytest.mark.parametrize("state", ["state-99", "", "a" * 64])
def test_an_unknown_state_is_a_400(world: World, state: str) -> None:
    world.start()

    response = world.client.post("/auth/callback", data={"state": state, "code": MEMBER_OID})

    assert response.status_code == 400


def test_a_state_works_once(world: World) -> None:
    state = world.start()
    world.come_back(state, code=MEMBER_OID)

    assert world.client.post("/auth/callback", data={"state": state, "code": MEMBER_OID}).status_code == 400


def test_a_state_runs_out_after_10_minutes(world: World) -> None:
    state = world.start()
    world.clock.advance(minutes=10)

    assert world.client.post("/auth/callback", data={"state": state, "code": MEMBER_OID}).status_code == 400


def test_a_members_code_swaps_for_a_session(world: World) -> None:
    response = world.swap(world.code())

    assert response.status_code == 200
    answer = response.json()
    assert answer["kind"] == "member"
    assert answer["token"].startswith("fhs_")
    # Who signed in, for the app to keep its copy under and greet them by.
    assert answer["object_id"] == MEMBER_OID
    assert answer["email"] == f"{MEMBER_OID}@gmail.example"
    assert (answer["name"], answer["given_name"]) == ("Ross Graham", "Ross")
    # Only the token's hash is kept, with the Member's tokens from the tenant.
    [session] = world.store.of_kind("session")
    assert session["id"] == hashlib.sha256(answer["token"].encode()).hexdigest()
    assert answer["token"] not in str(world.store.items)
    assert session["cache"] == f"cache-{MEMBER_OID}"
    assert session["memberId"] == "ross"
    assert session["ttl"] == 90 * 24 * 60 * 60
    assert world.store.of_kind("code") == []


def test_someone_not_in_the_household_gets_their_email_and_no_session(world: World) -> None:
    response = world.swap(world.code(STRANGER_OID))

    assert response.status_code == 200
    assert response.json() == {
        "kind": "refused",
        "token": None,
        "email": f"{STRANGER_OID}@gmail.example",
        "object_id": None,
        "name": None,
        "given_name": None,
    }
    assert world.store.of_kind("session") == []
    # Their tokens were never kept, not even with the code.
    assert "cache" not in str(world.store.items)


def test_a_code_works_once(world: World) -> None:
    code = world.code()
    world.swap(code)

    assert world.swap(code).status_code == 400
    assert len(world.store.of_kind("session")) == 1


def test_a_code_runs_out_after_2_minutes(world: World) -> None:
    code = world.code()
    world.clock.advance(minutes=2)

    assert world.swap(code).status_code == 400


@pytest.mark.parametrize("code", ["", "nonsense", "fhs_nonsense"])
def test_an_unknown_code_is_a_400(world: World, code: str) -> None:
    world.code()

    assert world.swap(code).status_code == 400


def test_a_session_signs_in_as_the_member(world: World) -> None:
    response = world.me(world.session())

    assert response.status_code == 200
    assert response.json() == {"kind": "member", "member_id": "ross"}


def test_a_session_works_on_every_member_endpoint(world: World) -> None:
    # Without lists or live updates set up, a 503 still shows the sign-in passed.
    headers = {"Authorization": f"Bearer {world.session()}"}

    assert world.client.get("/lists/shopping/items", headers=headers).status_code == 503
    assert (
        world.client.post("/lists/shopping/operations", headers=headers, json={"operations": []}).status_code
        == 503
    )
    assert world.client.get("/live", headers=headers).status_code == 503


def test_an_unknown_session_is_a_401(world: World) -> None:
    world.session()

    response = world.me("fhs_" + "x" * 43)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_a_sessions_stored_hash_isnt_a_token(world: World) -> None:
    world.session()
    [session] = world.store.of_kind("session")

    assert world.me(session["id"]).status_code == 401
    assert world.me("fhs_" + session["id"]).status_code == 401


def test_a_one_time_code_isnt_a_session(world: World) -> None:
    assert world.me("fhs_" + world.code()).status_code == 401


def test_removing_an_account_from_the_household_locks_its_sessions_out(world: World) -> None:
    session = world.session()
    world.accounts._accounts.clear()

    assert world.me(session).status_code == 403


def test_entra_is_asked_at_most_once_a_day(world: World) -> None:
    session = world.session()
    writes = world.store.writes

    world.clock.advance(hours=23)
    assert world.me(session).status_code == 200
    assert world.entra.refreshed == []
    # Nothing is written either, until the day is up.
    assert world.store.writes == writes

    world.clock.advance(hours=1)
    assert world.me(session).status_code == 200
    assert world.entra.refreshed == [f"cache-{MEMBER_OID}"]
    [stored] = world.store.of_kind("session")
    assert stored["cache"] == f"cache-{MEMBER_OID}+"
    assert stored["checked"] == world.clock.now.isoformat()

    world.clock.advance(hours=12)
    world.me(session)
    assert len(world.entra.refreshed) == 1


def test_when_entra_refuses_the_session_ends(world: World) -> None:
    session = world.session()
    world.entra.refusing = True
    world.clock.advance(days=1)

    assert world.me(session).status_code == 401
    assert world.store.of_kind("session") == []


def test_when_entra_cant_be_reached_the_member_is_let_in_and_asked_again_later(world: World) -> None:
    session = world.session()
    world.entra.unreachable = True
    world.clock.advance(days=1)

    assert world.me(session).status_code == 200

    world.entra.unreachable = False
    world.clock.advance(minutes=1)
    world.me(session)
    assert world.entra.refreshed == [f"cache-{MEMBER_OID}"]


def test_ending_a_session_signs_it_out(world: World) -> None:
    session = world.session()

    response = world.client.delete("/sessions/current", headers={"Authorization": f"Bearer {session}"})

    assert response.status_code == 204
    assert world.me(session).status_code == 401
    # Again, as a phone retrying would: still fine.
    assert (
        world.client.delete("/sessions/current", headers={"Authorization": f"Bearer {session}"}).status_code
        == 204
    )


def test_only_a_session_can_be_ended(world: World) -> None:
    assert (
        world.client.delete("/sessions/current", headers={"Authorization": f"Bearer {token()}"}).status_code
        == 400
    )
    assert world.client.delete("/sessions/current").status_code == 401


def test_entra_tokens_still_work_beside_sessions(world: World) -> None:
    world.session()

    assert world.me(token()).json() == {"kind": "member", "member_id": "ross"}
    assert world.me(hub_token()).json() == {"kind": "hub", "member_id": None}


def test_without_sessions_set_up_signing_in_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "ENTRA_TENANT_ID",
        "APP_CLIENT_ID",
        "APP_CLIENT_SECRET",
        "COSMOS_ENDPOINT",
        "COSMOS_DATABASE",
    ):
        monkeypatch.delenv(name, raising=False)
    client = TestClient(create_app(app_origins=[APP]), follow_redirects=False)

    assert client.get("/auth/sign-in", params={"return_to": APP}).status_code == 503
    assert client.post("/auth/session", json={"code": "x"}).status_code == 503


class FakeContainer:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}

    def read_item(self, item: str, partition_key: str) -> dict[str, Any]:
        assert item == partition_key
        if item not in self.items:
            raise CosmosResourceNotFoundError(message="Not found")
        return self.items[item]

    def upsert_item(self, body: dict[str, Any]) -> None:
        self.items[body["id"]] = body

    def delete_item(self, item: str, partition_key: str) -> None:
        assert item == partition_key
        if item not in self.items:
            raise CosmosResourceNotFoundError(message="Not found")
        del self.items[item]


def test_the_cosmos_store_keys_items_by_id() -> None:
    container = FakeContainer()
    store = CosmosStore(lambda: container)  # type: ignore[arg-type]

    store.put({"id": "a", "kind": "session", "ttl": 60})

    assert store.get("a") == {"id": "a", "kind": "session", "ttl": 60}
    assert store.get("b") is None
    assert store.delete("a") is True
    assert store.delete("a") is False


SIGN_IN_SETTINGS = {
    "ENTRA_TENANT_ID": SETTINGS.tenant_id,
    "ENTRA_SUBDOMAIN": SETTINGS.subdomain,
    "API_CLIENT_ID": SETTINGS.api_client_id,
    "APP_CLIENT_ID": "66666666-6666-6666-6666-666666666666",
    "APP_CLIENT_SECRET": "a-test-secret",
    # Nothing listens here: connecting would fail, so making sessions mustn't connect.
    "COSMOS_ENDPOINT": "https://localhost:1/",
    "COSMOS_DATABASE": "familyhub",
}


def test_sessions_come_from_the_app_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in SIGN_IN_SETTINGS.items():
        monkeypatch.setenv(name, value)

    assert sessions_from_environment(FakeAccounts({})) is not None


@pytest.mark.parametrize(
    "missing", ["APP_CLIENT_ID", "APP_CLIENT_SECRET", "COSMOS_ENDPOINT", "ENTRA_TENANT_ID"]
)
def test_without_any_one_setting_there_are_no_sessions(monkeypatch: pytest.MonkeyPatch, missing: str) -> None:
    for name, value in SIGN_IN_SETTINGS.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv(missing, "")

    assert sessions_from_environment(FakeAccounts({})) is None


def test_an_unresolved_key_vault_reference_is_no_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in SIGN_IN_SETTINGS.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv(
        "APP_CLIENT_SECRET", "@Microsoft.KeyVault(VaultName=kv;SecretName=family-app-client-secret)"
    )

    assert sessions_from_environment(FakeAccounts({})) is None


def test_the_api_comes_back_to_its_own_address_in_azure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WEBSITE_HOSTNAME", "func-familyhub-abc123.azurewebsites.net")
    monkeypatch.setenv("FAMILY_APP_ORIGINS", f"{APP},{DEV}")
    world = World()
    sessions = Sessions(world.entra, world.store, world.accounts, world.clock)
    client = TestClient(create_app(accounts=world.accounts, sessions=sessions), follow_redirects=False)

    assert client.get("/auth/sign-in", params={"return_to": APP}).status_code == 302
    assert client.get("/auth/sign-in", params={"return_to": DEV}).status_code == 302
    assert world.entra.started[-1] == "https://func-familyhub-abc123.azurewebsites.net/auth/callback"

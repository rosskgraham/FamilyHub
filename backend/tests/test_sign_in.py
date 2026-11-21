"""Sign-in, with tokens signed by a key made for the tests, standing in for the FamilyHub tenant's."""

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from familyhub_api.auth import EntraSettings, TokenChecker
from familyhub_api.main import create_app

SETTINGS = EntraSettings(
    tenant_id="11111111-1111-1111-1111-111111111111",
    subdomain="familyhubtest",
    api_client_id="22222222-2222-2222-2222-222222222222",
)
MEMBER_OID = "33333333-3333-3333-3333-333333333333"
STRANGER_OID = "44444444-4444-4444-4444-444444444444"
HUB_OID = "55555555-5555-5555-5555-555555555555"

TENANT_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeAccounts:
    def __init__(self, accounts: dict[str, str]) -> None:
        self._accounts = accounts

    def member_for(self, object_id: str) -> str | None:
        return self._accounts.get(object_id)


def token(key: Any = TENANT_KEY, **overrides: Any) -> str:
    """A delegated token for the Member, unless overridden. A claim set to None is left out."""
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": SETTINGS.issuers[0],
        "aud": SETTINGS.api_client_id,
        "tid": SETTINGS.tenant_id,
        "oid": MEMBER_OID,
        "sub": "someone",
        "scp": "Lists.ReadWrite",
        "iat": now,
        "nbf": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256")


def hub_token(**overrides: Any) -> str:
    claims: dict[str, Any] = {"oid": HUB_OID, "sub": HUB_OID, "scp": None, "roles": ["Hub"]}
    return token(**(claims | overrides))


@pytest.fixture
def client() -> TestClient:
    checker = TokenChecker(SETTINGS, signing_key_for=lambda _token: TENANT_KEY.public_key())
    return TestClient(create_app(checker=checker, accounts=FakeAccounts({MEMBER_OID: "ross"})))


def me(client: TestClient, bearer: str | None) -> Any:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer is not None else {}
    return client.get("/me", headers=headers)


def test_a_household_member_is_let_in_as_their_member_id(client: TestClient) -> None:
    response = me(client, token())

    assert response.status_code == 200
    assert response.json() == {"kind": "member", "member_id": "ross"}


def test_the_scope_can_be_one_of_several(client: TestClient) -> None:
    assert me(client, token(scp="openid Lists.ReadWrite profile")).status_code == 200


def test_a_token_from_login_microsoftonline_com_is_the_same_tenant(client: TestClient) -> None:
    assert me(client, token(iss=SETTINGS.issuers[1])).status_code == 200


def test_an_account_not_on_the_household_list_is_refused(client: TestClient) -> None:
    response = me(client, token(oid=STRANGER_OID))

    assert response.status_code == 403
    assert "Household" in response.json()["detail"]


def test_a_member_token_without_the_scope_is_refused(client: TestClient) -> None:
    assert me(client, token(scp="openid profile")).status_code == 403


def test_the_hub_is_let_in_as_the_hub(client: TestClient) -> None:
    response = me(client, hub_token())

    assert response.status_code == 200
    assert response.json() == {"kind": "hub", "member_id": None}


def test_an_app_token_without_the_hub_role_is_refused(client: TestClient) -> None:
    assert me(client, hub_token(roles=["Something.Else"])).status_code == 403
    assert me(client, hub_token(roles=None)).status_code == 403


@pytest.mark.parametrize(
    "bearer",
    [
        pytest.param(None, id="no token"),
        pytest.param("", id="empty token"),
        pytest.param("not-a-jwt", id="not a token"),
        pytest.param(token(exp=int(time.time()) - 3600), id="expired"),
        pytest.param(token(key=OTHER_KEY), id="signed by another key"),
        pytest.param(token(aud="99999999-9999-9999-9999-999999999999"), id="for another API"),
        pytest.param(token(iss="https://evil.example/v2.0"), id="another issuer"),
        pytest.param(token(tid="99999999-9999-9999-9999-999999999999"), id="another tenant"),
        pytest.param(token(oid=None), id="no object id"),
    ],
)
def test_a_missing_or_bad_token_is_a_401(client: TestClient, bearer: str | None) -> None:
    response = me(client, bearer)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_a_token_signed_with_none_is_a_401(client: TestClient) -> None:
    unsigned = jwt.encode({"oid": MEMBER_OID, "scp": "Lists.ReadWrite"}, key=None, algorithm="none")

    assert me(client, unsigned).status_code == 401


def test_only_bearer_tokens_count(client: TestClient) -> None:
    assert client.get("/me", headers={"Authorization": f"Basic {token()}"}).status_code == 401


def test_health_needs_no_sign_in(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


def test_before_sign_in_is_set_up_me_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("ENTRA_TENANT_ID", "ENTRA_SUBDOMAIN", "API_CLIENT_ID", "COSMOS_ENDPOINT", "COSMOS_DATABASE"):
        monkeypatch.delenv(name, raising=False)

    response = me(TestClient(create_app()), token())

    assert response.status_code == 503


def test_settings_come_from_the_app_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENTRA_TENANT_ID", SETTINGS.tenant_id)
    monkeypatch.setenv("ENTRA_SUBDOMAIN", SETTINGS.subdomain)
    monkeypatch.setenv("API_CLIENT_ID", SETTINGS.api_client_id)

    assert EntraSettings.from_environment() == SETTINGS
    assert SETTINGS.jwks_url == (
        "https://familyhubtest.ciamlogin.com/11111111-1111-1111-1111-111111111111/discovery/v2.0/keys"
    )


def test_a_blank_setting_means_not_set_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENTRA_TENANT_ID", SETTINGS.tenant_id)
    monkeypatch.setenv("ENTRA_SUBDOMAIN", "")
    monkeypatch.setenv("API_CLIENT_ID", SETTINGS.api_client_id)

    assert EntraSettings.from_environment() is None

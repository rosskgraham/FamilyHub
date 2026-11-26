"""The tenant as a confidential client, through MSAL itself, with a stand-in for the tenant's endpoints."""

import base64
import hashlib
import json
import time
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from test_sign_in import MEMBER_OID, SETTINGS

from familyhub_api.sessions import MsalEntra, SignInRefused

CLIENT_ID = "66666666-6666-6666-6666-666666666666"
SECRET = "a-test-secret"
AUTHORITY = f"https://{SETTINGS.subdomain}.ciamlogin.com/{SETTINGS.tenant_id}"
CALLBACK = "https://func-familyhub-test.azurewebsites.net/auth/callback"


def b64(value: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


class Answer:
    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self.text = json.dumps(body)
        self.headers: dict[str, str] = {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeTenant:
    """The tenant's discovery document and token endpoint. The token endpoint answers with whatever's next."""

    def __init__(self) -> None:
        self.posts: list[dict[str, Any]] = []
        self.nonce = ""
        self.refusing = False
        self.error = "invalid_grant"

    def get(self, url: str, **_: Any) -> Answer:
        assert url == f"{AUTHORITY}/v2.0/.well-known/openid-configuration"
        return Answer(
            200,
            {
                "authorization_endpoint": f"{AUTHORITY}/oauth2/v2.0/authorize",
                "token_endpoint": f"{AUTHORITY}/oauth2/v2.0/token",
                "issuer": f"https://{SETTINGS.tenant_id}.ciamlogin.com/{SETTINGS.tenant_id}/v2.0",
            },
        )

    def post(self, url: str, data: dict[str, Any] | None = None, **_: Any) -> Answer:
        assert url == f"{AUTHORITY}/oauth2/v2.0/token"
        self.posts.append(dict(data or {}))
        if self.refusing:
            return Answer(400, {"error": self.error, "error_description": "AADSTS700082: expired"})
        now = int(time.time())
        claims = {
            "iss": f"https://{SETTINGS.tenant_id}.ciamlogin.com/{SETTINGS.tenant_id}/v2.0",
            "aud": CLIENT_ID,
            "oid": MEMBER_OID,
            "sub": "someone",
            "tid": SETTINGS.tenant_id,
            "email": "ross@gmail.example",
            "nonce": self.nonce,
            "iat": now,
            "exp": now + 3600,
        }
        return Answer(
            200,
            {
                "token_type": "Bearer",
                "scope": f"api://{SETTINGS.api_client_id}/Lists.ReadWrite",
                "expires_in": 3600,
                "access_token": f"access-{len(self.posts)}",
                "refresh_token": f"refresh-{len(self.posts)}",
                "id_token": f"{b64({'alg': 'none'})}.{b64(claims)}.",
                "client_info": b64({"uid": MEMBER_OID, "utid": SETTINGS.tenant_id}),
            },
        )

    def close(self) -> None:
        pass


@pytest.fixture
def tenant() -> FakeTenant:
    return FakeTenant()


@pytest.fixture
def entra(tenant: FakeTenant) -> MsalEntra:
    return MsalEntra(SETTINGS, CLIENT_ID, SECRET, http_client=tenant)


def started(entra: MsalEntra, tenant: FakeTenant) -> dict[str, Any]:
    flow = entra.start(CALLBACK)
    # The tenant puts the nonce's hash in the ID token, which MSAL checks.
    tenant.nonce = hashlib.sha256(flow["nonce"].encode()).hexdigest()
    return flow


def test_it_asks_for_a_code_with_pkce_and_the_lists_scope(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)

    url = urlsplit(flow["auth_uri"])
    query = {name: values[0] for name, values in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{AUTHORITY}/oauth2/v2.0/authorize"
    assert query["client_id"] == CLIENT_ID
    assert query["response_type"] == "code"
    assert query["response_mode"] == "form_post"
    assert query["redirect_uri"] == CALLBACK
    assert query["prompt"] == "select_account"
    assert query["code_challenge_method"] == "S256"
    assert query["state"] == flow["state"]
    assert set(query["scope"].split()) == {
        f"api://{SETTINGS.api_client_id}/Lists.ReadWrite",
        "openid",
        "profile",
        "offline_access",
    }
    # The flow is kept in Cosmos DB as JSON.
    json.dumps(flow)


def test_it_redeems_the_code_with_the_secret_and_the_verifier(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)

    account = entra.finish(flow, {"state": flow["state"], "code": "the-code"})

    [redeemed] = tenant.posts
    assert redeemed["grant_type"] == "authorization_code"
    assert redeemed["code"] == "the-code"
    assert redeemed["client_secret"] == SECRET
    assert redeemed["code_verifier"] == flow["code_verifier"]
    assert account.object_id == MEMBER_OID
    assert account.email == "ross@gmail.example"
    assert "refresh-1" in account.cache


def test_a_response_for_another_flow_is_refused(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)

    with pytest.raises(SignInRefused):
        entra.finish(flow, {"state": "someone-elses", "code": "the-code"})
    assert tenant.posts == []


def test_a_code_the_tenant_refuses_is_refused(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)
    tenant.refusing = True

    with pytest.raises(SignInRefused) as refused:
        entra.finish(flow, {"state": flow["state"], "code": "the-code"})
    assert refused.value.error == "invalid_grant"


def test_refreshing_asks_entra_with_the_refresh_token(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)
    cache = entra.finish(flow, {"state": flow["state"], "code": "the-code"}).cache

    refreshed = entra.refresh(cache)

    assert refreshed is not None
    assert tenant.posts[-1]["grant_type"] == "refresh_token"
    assert tenant.posts[-1]["refresh_token"] == "refresh-1"
    assert tenant.posts[-1]["client_secret"] == SECRET
    assert "refresh-2" in refreshed


def test_refreshing_asks_entra_even_with_a_fresh_access_token(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)
    cache = entra.finish(flow, {"state": flow["state"], "code": "the-code"}).cache

    entra.refresh(cache)

    assert len(tenant.posts) == 2


def test_when_entra_refuses_to_refresh_there_are_no_tokens(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)
    cache = entra.finish(flow, {"state": flow["state"], "code": "the-code"}).cache
    tenant.refusing = True

    assert entra.refresh(cache) is None


def test_an_empty_cache_has_no_tokens(entra: MsalEntra) -> None:
    assert entra.refresh("{}") is None


def test_an_expired_client_secret_doesnt_sign_the_member_out(entra: MsalEntra, tenant: FakeTenant) -> None:
    flow = started(entra, tenant)
    cache = entra.finish(flow, {"state": flow["state"], "code": "the-code"}).cache
    tenant.refusing = True
    tenant.error = "invalid_client"

    # Raised, which Sessions treats as Entra not answering: the Member is let in, and asked again later.
    with pytest.raises(RuntimeError, match="invalid_client"):
        entra.refresh(cache)

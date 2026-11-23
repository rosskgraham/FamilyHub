"""CORS: the family app, on Static Web Apps, calls the API from another origin (AB#56)."""

import pytest
from fastapi.testclient import TestClient

from familyhub_api.main import create_app

APP = "https://lively-beach-0.azurestaticapps.net"
DEV = "http://localhost:5173"


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(allowed_origins=[APP, DEV]))


def preflight(client: TestClient, origin: str, method: str = "GET") -> dict[str, str]:
    response = client.options(
        "/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization",
        },
    )
    return {"status": str(response.status_code), **{k.lower(): v for k, v in response.headers.items()}}


@pytest.mark.parametrize("origin", [APP, DEV])
def test_the_family_app_may_call_with_a_token(client: TestClient, origin: str) -> None:
    answer = preflight(client, origin)

    assert answer["status"] == "200"
    assert answer["access-control-allow-origin"] == origin
    assert "authorization" in answer["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in answer


def test_posting_operations_is_allowed(client: TestClient) -> None:
    assert preflight(client, APP, "POST")["status"] == "200"


@pytest.mark.parametrize(
    "origin", ["https://evil.example", "https://lively-beach-0.azurestaticapps.net.evil", "null"]
)
def test_other_origins_are_refused(client: TestClient, origin: str) -> None:
    answer = preflight(client, origin)

    assert answer["status"] == "400"
    assert "access-control-allow-origin" not in answer


def test_a_real_request_from_the_app_carries_the_origin_header(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": APP})

    assert response.headers["access-control-allow-origin"] == APP


def test_the_origins_come_from_allowed_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", f" {APP} , {DEV},")
    client = TestClient(create_app())

    assert preflight(client, APP)["status"] == "200"
    assert preflight(client, DEV)["status"] == "200"
    assert preflight(client, "https://evil.example")["status"] == "400"


def test_with_no_setting_no_origin_is_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    assert preflight(TestClient(create_app()), APP)["status"] == "400"

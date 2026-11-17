from datetime import datetime

from fastapi.testclient import TestClient

from familyhub_api.main import create_app


def test_health_says_ok() -> None:
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert datetime.fromisoformat(body["started_at"]).tzinfo is not None
    assert body["uptime_seconds"] >= 0


def test_started_at_stays_the_same_while_the_process_runs() -> None:
    client = TestClient(create_app())

    first = client.get("/health").json()["started_at"]
    second = client.get("/health").json()["started_at"]

    assert first == second


def test_no_api_docs_are_served() -> None:
    client = TestClient(create_app())

    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_function_app_wraps_the_fastapi_app() -> None:
    import function_app

    assert function_app.app is not None

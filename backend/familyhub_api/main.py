"""The FastAPI app. It runs as a plain FastAPI service locally and in the tests, and on Azure Functions Flex
Consumption through function_app.py (ADR 0011)."""

import time
from datetime import UTC, datetime

from fastapi import FastAPI
from pydantic import BaseModel

# When this process started. Flex Consumption scales to zero after a quiet spell, so a new value here means
# the request had a cold start. That's how slice 1 measures how long Flex waits before scaling to zero.
_STARTED_AT = datetime.now(UTC)
_STARTED_MONOTONIC = time.monotonic()


class Health(BaseModel):
    status: str
    started_at: datetime
    uptime_seconds: float


def create_app() -> FastAPI:
    app = FastAPI(title="FamilyHub API", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    def health() -> Health:
        """Answers when the API is up. Anyone can call it, and it says nothing about the Household."""
        return Health(
            status="ok",
            started_at=_STARTED_AT,
            uptime_seconds=round(time.monotonic() - _STARTED_MONOTONIC, 1),
        )

    return app


app = create_app()

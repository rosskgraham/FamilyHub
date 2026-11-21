"""The FastAPI app. It runs as a plain FastAPI service locally and in the tests, and on Azure Functions Flex
Consumption through function_app.py (ADR 0011)."""

import time
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from familyhub_api.accounts import CosmosAccounts
from familyhub_api.auth import Accounts, Caller, EntraSettings, SignIn, TokenChecker

# When this process started. Flex Consumption scales to zero after a quiet spell, so a new value here means
# the request had a cold start. That's how slice 1 measures how long Flex waits before scaling to zero.
_STARTED_AT = datetime.now(UTC)
_STARTED_MONOTONIC = time.monotonic()


class Health(BaseModel):
    status: str
    started_at: datetime
    uptime_seconds: float


class Me(BaseModel):
    kind: Literal["member", "hub"]
    member_id: str | None


def create_app(checker: TokenChecker | None = None, accounts: Accounts | None = None) -> FastAPI:
    """The app. Without a checker or accounts, it makes them from the app settings, as in Azure."""
    if checker is None and (settings := EntraSettings.from_environment()) is not None:
        checker = TokenChecker(settings)
    if accounts is None:
        accounts = CosmosAccounts.from_environment()
    signed_in = SignIn(checker, accounts)

    app = FastAPI(title="FamilyHub API", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    def health() -> Health:
        """Answers when the API is up. Anyone can call it, and it says nothing about the Household."""
        return Health(
            status="ok",
            started_at=_STARTED_AT,
            uptime_seconds=round(time.monotonic() - _STARTED_MONOTONIC, 1),
        )

    @app.get("/me")
    def me(caller: Annotated[Caller, Depends(signed_in)]) -> Me:
        """Who the caller is: a Member, by the id the Hub gave them, or the Hub itself."""
        return Me(kind=caller.kind, member_id=caller.member_id)

    return app


app = create_app()

"""The FastAPI app. It runs as a plain FastAPI service locally and in the tests, and on Azure Functions Flex
Consumption through function_app.py (ADR 0011)."""

import logging
import os
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal

from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from familyhub_api.accounts import CosmosAccounts
from familyhub_api.auth import Accounts, Caller, EntraSettings, SignIn, TokenChecker
from familyhub_api.cosmos_lists import CosmosLists
from familyhub_api.lists import Applied, Busy, Item, Lists, Operations, Store
from familyhub_api.live import Live, WebPubSubLive

SHOPPING = "shopping"

logger = logging.getLogger(__name__)

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


class AppliedOperations(BaseModel):
    results: list[Applied]


class LiveConnection(BaseModel):
    # A Web PubSub client URL, with an access token that lasts an hour. Ask for a new one to reconnect.
    url: str


class ChangedItems(BaseModel):
    items: list[Item]
    # Ask for everything after this next time.
    seq: int


def create_app(
    checker: TokenChecker | None = None,
    accounts: Accounts | None = None,
    store: Store | None = None,
    live: Live | None = None,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    """The app. Without a checker, accounts, store or live updates, it makes them from the app settings, as in
    Azure."""
    if checker is None and (settings := EntraSettings.from_environment()) is not None:
        checker = TokenChecker(settings)
    if accounts is None:
        accounts = CosmosAccounts.from_environment()
    if store is None:
        store = CosmosLists.from_environment()
    if live is None:
        live = WebPubSubLive.from_environment()
    signed_in = SignIn(checker, accounts)
    lists = Lists(store, clock) if store is not None else None

    def shared_lists() -> Lists:
        if lists is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The lists aren't set up yet.")
        return lists

    app = FastAPI(title="FamilyHub API", docs_url=None, redoc_url=None, openapi_url=None)
    # The family app is served from Static Web Apps, another origin, so the browser asks first (AB#56). Only
    # the app's own address and the PC's dev server are let in, sending a bearer token, never cookies.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if allowed_origins is not None else _origins_from_environment(),
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
        max_age=3600,
    )

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

    @app.post("/lists/shopping/operations")
    def change_shopping(
        body: Operations,
        caller: Annotated[Caller, Depends(signed_in)],
        lists: Annotated[Lists, Depends(shared_lists)],
    ) -> AppliedOperations:
        """Applies a batch of operations to the Shopping list, in order. Sending one again does no harm."""
        by = caller.member_id if caller.kind == "member" and caller.member_id else "hub"
        changes: list[int] = []
        try:
            with _unavailable_if_cosmos_fails():
                return AppliedOperations(results=lists.apply(SHOPPING, body.operations, by, changes))
        finally:
            # Even when the batch failed partway, what was saved is worth telling the other devices about.
            if changes:
                _tell(live, SHOPPING, max(changes))

    @app.get("/live")
    def live_connection(caller: Annotated[Caller, Depends(signed_in)]) -> LiveConnection:
        """Where to connect for live updates: every connection hears {"list": ..., "seq": ...} when a list
        changes, and catches up from its last seq."""
        if live is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Live updates aren't set up yet.")
        try:
            return LiveConnection(url=live.client_url())
        except Exception as error:
            logger.warning("Couldn't get a Web PubSub client URL.", exc_info=True)
            unavailable = HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Can't reach live updates now.")
            raise unavailable from error

    @app.get("/lists/shopping/items")
    def shopping_items(
        caller: Annotated[Caller, Depends(signed_in)],
        lists: Annotated[Lists, Depends(shared_lists)],
        after: Annotated[int, Query(ge=0)] = 0,
    ) -> ChangedItems:
        """The Shopping list's items changed after sequence number after, removed ones as markers. From 0,
        what's still to get and what was ticked off in the last 10 minutes."""
        with _unavailable_if_cosmos_fails():
            caught_up = lists.changed_since(SHOPPING, after)
        return ChangedItems(items=caught_up.items, seq=caught_up.seq)

    return app


def _origins_from_environment() -> list[str]:
    """The origins in ALLOWED_ORIGINS, comma-separated, which the Bicep fills in. None when it's unset."""
    return [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]


def _tell(live: Live | None, list_id: str, seq: int) -> None:
    """Tells the other devices the list changed. The save stands whatever happens here: a device that misses
    the message catches up when it next asks."""
    if live is None:
        return
    try:
        live.changed(list_id, seq)
    except Exception:
        # The message carries no item text, so neither does the failure.
        logger.warning("Couldn't tell clients the %s list changed, up to %s.", list_id, seq, exc_info=True)


@contextmanager
def _unavailable_if_cosmos_fails() -> Iterator[None]:
    """Turns Cosmos DB failing, or being too busy, into a 503: not the caller's fault, and worth retrying."""
    try:
        yield
    except (Busy, CosmosHttpResponseError) as error:
        unavailable = HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Can't reach the lists right now.")
        raise unavailable from error


app = create_app()

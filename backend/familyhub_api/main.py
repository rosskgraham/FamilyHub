"""The FastAPI app. It runs as a plain FastAPI service locally and in the tests, and on Azure Functions Flex
Consumption through function_app.py (ADR 0011)."""

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal

from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi import Depends, FastAPI, HTTPException, Query, status
from pydantic import BaseModel

from familyhub_api.accounts import CosmosAccounts
from familyhub_api.auth import Accounts, Caller, EntraSettings, SignIn, TokenChecker
from familyhub_api.cosmos_lists import CosmosLists
from familyhub_api.lists import Applied, Busy, Item, Lists, Operations, Store

SHOPPING = "shopping"

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


class ChangedItems(BaseModel):
    items: list[Item]
    # Ask for everything after this next time.
    seq: int


def create_app(
    checker: TokenChecker | None = None,
    accounts: Accounts | None = None,
    store: Store | None = None,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> FastAPI:
    """The app. Without a checker, accounts or store, it makes them from the app settings, as in Azure."""
    if checker is None and (settings := EntraSettings.from_environment()) is not None:
        checker = TokenChecker(settings)
    if accounts is None:
        accounts = CosmosAccounts.from_environment()
    if store is None:
        store = CosmosLists.from_environment()
    signed_in = SignIn(checker, accounts)
    lists = Lists(store, clock) if store is not None else None

    def shared_lists() -> Lists:
        if lists is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The lists aren't set up yet.")
        return lists

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

    @app.post("/lists/shopping/operations")
    def change_shopping(
        body: Operations,
        caller: Annotated[Caller, Depends(signed_in)],
        lists: Annotated[Lists, Depends(shared_lists)],
    ) -> AppliedOperations:
        """Applies a batch of operations to the Shopping list, in order. Sending one again does no harm."""
        by = caller.member_id if caller.kind == "member" and caller.member_id else "hub"
        with _unavailable_if_cosmos_fails():
            return AppliedOperations(results=lists.apply(SHOPPING, body.operations, by))

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


@contextmanager
def _unavailable_if_cosmos_fails() -> Iterator[None]:
    """Turns Cosmos DB failing, or being too busy, into a 503: not the caller's fault, and worth retrying."""
    try:
        yield
    except (Busy, CosmosHttpResponseError) as error:
        unavailable = HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Can't reach the lists right now.")
        raise unavailable from error


app = create_app()

"""The FastAPI app. It runs as a plain FastAPI service locally and in the tests, and on Azure Functions Flex
Consumption through function_app.py (ADR 0011)."""

import logging
import os
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import parse_qs, urlencode

from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from familyhub_api.accounts import CosmosAccounts
from familyhub_api.auth import (
    SESSION_PREFIX,
    Accounts,
    Caller,
    EntraSettings,
    SignIn,
    TokenChecker,
    bearer_token,
)
from familyhub_api.cosmos_lists import CosmosLists
from familyhub_api.lists import Applied, Busy, Item, Lists, Operations, ShopShown, Store
from familyhub_api.live import Live, WebPubSubLive
from familyhub_api.sessions import Sessions, SignInRefused, sessions_from_environment

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


class SessionCode(BaseModel):
    code: str


class SessionAnswer(BaseModel):
    # A Member gets a session token. Anyone else gets their email address, for screen B, and no session.
    kind: Literal["member", "refused"]
    token: str | None = None
    email: str | None = None


class ChangedItems(BaseModel):
    items: list[Item]
    # The shops changed after the number asked for, each with its learned walking order (#84).
    shops: list[ShopShown]
    # Ask for everything after this next time.
    seq: int


def create_app(
    checker: TokenChecker | None = None,
    accounts: Accounts | None = None,
    store: Store | None = None,
    live: Live | None = None,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    allowed_origins: list[str] | None = None,
    sessions: Sessions | None = None,
    app_origins: list[str] | None = None,
    public_url: str | None = None,
) -> FastAPI:
    """The app. Without a checker, accounts, store, live updates or sessions, it makes them from the app
    settings, as in Azure."""
    if checker is None and (settings := EntraSettings.from_environment()) is not None:
        checker = TokenChecker(settings)
    if accounts is None:
        accounts = CosmosAccounts.from_environment()
    if store is None:
        store = CosmosLists.from_environment()
    if live is None:
        live = WebPubSubLive.from_environment()
    if sessions is None:
        sessions = sessions_from_environment(accounts)
    if app_origins is None:
        app_origins = _family_app_origins_from_environment()
    if public_url is None:
        public_url = _public_url_from_environment()
    signed_in = SignIn(checker, accounts, sessions)
    lists = Lists(store, clock) if store is not None else None

    def signing_in() -> Sessions:
        if sessions is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Signing in isn't set up yet.")
        return sessions

    def shared_lists() -> Lists:
        if lists is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The lists aren't set up yet.")
        return lists

    app = FastAPI(title="FamilyHub API", docs_url=None, redoc_url=None, openapi_url=None)
    # CORS for running the API on a PC (ALLOWED_ORIGINS). In Azure the Functions host answers the browser's
    # preflight itself, so CORS there is the function app's own setting, in infra/backend.bicep (AB#56); this
    # stays off there, as both at once would send the header twice. Bearer tokens only, never cookies.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if allowed_origins is not None else _origins_from_environment(),
        allow_methods=["GET", "POST", "DELETE"],
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

    @app.get("/auth/sign-in")
    def sign_in(
        request: Request, sessions: Annotated[Sessions, Depends(signing_in)], return_to: str
    ) -> RedirectResponse:
        """Starts signing in to the FamilyHub tenant. It comes back to the family app at return_to, which must
        be one of its own addresses, so this can't send anyone elsewhere."""
        if return_to not in app_origins:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That isn't the family app.")
        callback = f"{public_url or str(request.base_url).rstrip('/')}/auth/callback"
        return RedirectResponse(sessions.start(callback, return_to), status.HTTP_302_FOUND)

    @app.api_route("/auth/callback", methods=["GET", "POST"])
    async def callback(
        request: Request, sessions: Annotated[Sessions, Depends(signing_in)]
    ) -> RedirectResponse:
        """Where the tenant comes back to, posting a form (or in the query, for some errors). Goes on to the
        family app's /auth/done with a one-time code, or an error if nobody was signed in."""
        response = dict(request.query_params)
        if request.method == "POST":
            form = parse_qs((await request.body()).decode(errors="replace"))
            response |= {name: values[0] for name, values in form.items()}
        # Cosmos DB and the tenant are called synchronously, so off the event loop.
        return_to = await run_in_threadpool(sessions.return_to, response.get("state", ""))
        if return_to is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in has run out. Start again.")
        try:
            answer = {"code": await run_in_threadpool(sessions.finish, response)}
        except SignInRefused as refused:
            answer = {"error": refused.error}
        except Exception:
            logger.warning("Couldn't finish signing in.", exc_info=True)
            answer = {"error": "failed"}
        # 303, so the browser goes on with a GET after the tenant's POST.
        return RedirectResponse(f"{return_to}/auth/done?{urlencode(answer)}", status.HTTP_303_SEE_OTHER)

    @app.post("/auth/session")
    def session(body: SessionCode, sessions: Annotated[Sessions, Depends(signing_in)]) -> SessionAnswer:
        """Swaps the one-time code from /auth/done for a session token. A code works once, for 2 minutes."""
        with _unavailable_if_cosmos_fails():
            signed = sessions.swap(body.code)
        if signed is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That sign-in has run out. Sign in again.")
        return SessionAnswer(kind=signed.kind, token=signed.token, email=signed.email)

    @app.delete("/sessions/current", status_code=status.HTTP_204_NO_CONTENT)
    def end_session(request: Request, sessions: Annotated[Sessions, Depends(signing_in)]) -> Response:
        """Ends the session sending it, as when signing out. Ending one that's already gone is fine."""
        token = bearer_token(request)
        if not token.startswith(SESSION_PREFIX):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a session can be ended.")
        with _unavailable_if_cosmos_fails():
            sessions.end(token)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

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
        """The Shopping list's items and shops changed after sequence number after, removed items as markers.
        From 0, what's still to get, what was ticked off in the last 10 minutes, and every shop."""
        with _unavailable_if_cosmos_fails():
            caught_up = lists.changed_since(SHOPPING, after)
        return ChangedItems(items=caught_up.items, shops=caught_up.shops, seq=caught_up.seq)

    return app


def _origins_from_environment() -> list[str]:
    """The origins in ALLOWED_ORIGINS, comma-separated, which the Bicep fills in. None when it's unset."""
    return [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]


def _family_app_origins_from_environment() -> list[str]:
    """Where signing in may return to: FAMILY_APP_ORIGINS, which the Bicep fills in, and on a PC the CORS
    origins too."""
    names = ("FAMILY_APP_ORIGINS", "ALLOWED_ORIGINS")
    return [
        origin.strip() for name in names for origin in os.environ.get(name, "").split(",") if origin.strip()
    ]


def _public_url_from_environment() -> str | None:
    """The API's own address, for the tenant to come back to. Azure sets WEBSITE_HOSTNAME. On a PC, it's
    the address the request came to."""
    hostname = os.environ.get("WEBSITE_HOSTNAME", "").strip()
    return f"https://{hostname}" if hostname else None


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

"""Sign-in held by the backend (ADR 0016): the API signs Members in to the FamilyHub tenant as a confidential
client, keeps their Entra tokens, and gives each phone a FamilyHub session token of its own.

The phone opens /auth/sign-in, which sends it to the tenant with an authorisation code flow and PKCE. The
tenant comes back to /auth/callback, which redeems the code with the client secret and sends the phone back to
the family app with a one-time code. The app swaps that for a session token at /auth/session. The token is
random, and only its SHA-256 hash is kept, with the session's MSAL token cache. At most once a day, a call
with the token refreshes those tokens from Entra, so a session lasts as long as Entra's refresh token does:
90 days unused, sliding. If Entra refuses, the session ends.

Sign-in flows, one-time codes and sessions all live in Cosmos DB's sessions container, each with its own TTL,
so nothing needs cookies: the family app and the API are on different sites.
"""

import hashlib
import logging
import os
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol

import msal
from azure.cosmos import ContainerProxy, CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from azure.identity import DefaultAzureCredential

from familyhub_api.auth import SCOPE, SESSION_PREFIX, Accounts, EntraSettings, NotSignedIn

CONTAINER = "sessions"

FLOW_SECONDS = 10 * 60
CODE_SECONDS = 2 * 60
# Cosmos DB deletes a session left unchecked this long. Entra's refresh token lasts 90 days unused, so the
# session can't outlive it by much anyway.
SESSION_SECONDS = 90 * 24 * 60 * 60
CHECK_EVERY = timedelta(days=1)
# What Entra says when a refresh token is no good any more: expired, revoked, or the account's gone.
SIGNED_OUT = ("invalid_grant", "interaction_required")

logger = logging.getLogger(__name__)


def hashed(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


@dataclass(frozen=True)
class Account:
    """Who the tenant signed in, and their tokens, as an MSAL token cache."""

    object_id: str
    email: str
    cache: str
    # From the ID token, for the family app to greet the Member by.
    name: str = ""
    given_name: str = ""


class SignInRefused(Exception):
    """The tenant didn't sign anyone in: cancelled at the account choice, or an error."""

    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class Entra(Protocol):
    """The FamilyHub tenant, as a confidential client."""

    def start(self, redirect_uri: str) -> dict[str, Any]:
        """A new authorisation code flow: where to send the browser (auth_uri), and its state."""
        ...

    def finish(self, flow: dict[str, Any], response: dict[str, str]) -> Account:
        """Redeems the code the tenant sent back. Raises SignInRefused if there's no account."""
        ...

    def refresh(self, cache: str) -> str | None:
        """Asks Entra for new tokens: the updated cache, or None if Entra refuses."""
        ...


class MsalEntra:
    def __init__(self, settings: EntraSettings, client_id: str, secret: str, http_client: Any = None) -> None:
        self._authority = f"https://{settings.subdomain}.ciamlogin.com/{settings.tenant_id}"
        self._client_id = client_id
        self._secret = secret
        self._http_client = http_client
        self._scopes = [f"api://{settings.api_client_id}/{SCOPE}"]

    def _client(self, cache: msal.SerializableTokenCache | None = None) -> msal.ConfidentialClientApplication:
        return msal.ConfidentialClientApplication(
            self._client_id,
            client_credential=self._secret,
            authority=self._authority,
            token_cache=cache,
            http_client=self._http_client,
        )

    def start(self, redirect_uri: str) -> dict[str, Any]:
        # MSAL adds openid, profile and offline_access itself, and makes the PKCE verifier and the state. The
        # tenant posts the code back as a form, so it's never in a URL (RFC 9700).
        return self._client().initiate_auth_code_flow(
            self._scopes, redirect_uri=redirect_uri, prompt="select_account", response_mode="form_post"
        )

    def finish(self, flow: dict[str, Any], response: dict[str, str]) -> Account:
        cache = msal.SerializableTokenCache()
        try:
            result = self._client(cache).acquire_token_by_auth_code_flow(flow, response, scopes=self._scopes)
        except ValueError as error:
            # The response doesn't match the flow, as when its state is someone else's.
            raise SignInRefused("state_mismatch") from error
        if "error" in result:
            raise SignInRefused(str(result["error"]))
        claims = result.get("id_token_claims") or {}
        email = claims.get("email") or claims.get("preferred_username") or ""
        return Account(
            object_id=str(claims["oid"]),
            email=str(email),
            cache=cache.serialize(),
            name=str(claims.get("name") or ""),
            given_name=str(claims.get("given_name") or ""),
        )

    def refresh(self, cache: str) -> str | None:
        tokens = msal.SerializableTokenCache()
        tokens.deserialize(cache)
        client = self._client(tokens)
        accounts = client.get_accounts()
        if not accounts:
            return None
        # Forced, so Entra is asked: that's how a revoked or expired sign-in is found.
        result = client.acquire_token_silent_with_error(self._scopes, accounts[0], force_refresh=True)
        if not result:
            return None
        if "error" in result:
            # Only these mean the Member's sign-in is over. Anything else, such as an expired client secret
            # (invalid_client), is the backend's problem, and mustn't sign every phone out.
            if result["error"] in SIGNED_OUT:
                return None
            raise RuntimeError(f"Entra didn't refresh the session: {result['error']}")
        return tokens.serialize()


class Store(Protocol):
    """Where flows, codes and sessions are kept, by id. Every item has a ttl in seconds."""

    def get(self, item_id: str) -> dict[str, Any] | None: ...
    def put(self, item: dict[str, Any]) -> None: ...
    def delete(self, item_id: str) -> bool:
        """Deletes the item, saying whether it was there."""
        ...


class CosmosStore:
    """The sessions container, keyed by /id, connecting the first time it's asked."""

    def __init__(self, connect: Callable[[], ContainerProxy]) -> None:
        self._connect = connect
        self._container: ContainerProxy | None = None

    @classmethod
    def from_environment(cls) -> "CosmosStore | None":
        endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
        database = os.environ.get("COSMOS_DATABASE", "").strip()
        if not endpoint or not database:
            return None

        def connect() -> ContainerProxy:
            client = CosmosClient(endpoint, credential=DefaultAzureCredential())
            return client.get_database_client(database).get_container_client(CONTAINER)

        return cls(connect)

    @property
    def container(self) -> ContainerProxy:
        if self._container is None:
            self._container = self._connect()
        return self._container

    def get(self, item_id: str) -> dict[str, Any] | None:
        try:
            # An item past its ttl is never returned, even before Cosmos DB has removed it.
            return self.container.read_item(item=item_id, partition_key=item_id)
        except CosmosResourceNotFoundError:
            return None

    def put(self, item: dict[str, Any]) -> None:
        # Writing an item starts its ttl again.
        self.container.upsert_item(item)

    def delete(self, item_id: str) -> bool:
        try:
            self.container.delete_item(item=item_id, partition_key=item_id)
        except CosmosResourceNotFoundError:
            return False
        return True


@dataclass(frozen=True)
class Signed:
    """What a one-time code swaps for: a Member's session token, with who they are for the family app to
    show, or the email of an account that isn't the Household's."""

    kind: Literal["member", "refused"]
    token: str | None = None
    email: str | None = None
    object_id: str | None = None
    name: str | None = None
    given_name: str | None = None


class Sessions:
    def __init__(
        self,
        entra: Entra,
        store: Store,
        accounts: Accounts,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._entra = entra
        self._store = store
        self._accounts = accounts
        self._clock = clock

    def start(self, redirect_uri: str, return_to: str) -> str:
        """Starts signing in, and says where to send the browser."""
        flow = self._entra.start(redirect_uri)
        self._store.put(
            {
                "id": _flow_id(flow["state"]),
                "kind": "flow",
                "flow": flow,
                "returnTo": return_to,
                "expires": self._at(FLOW_SECONDS),
                "ttl": FLOW_SECONDS,
            }
        )
        return flow["auth_uri"]

    def return_to(self, state: str) -> str | None:
        """The family app a sign-in came from, if the state is one of ours and still current."""
        flow = self._live(_flow_id(state), "flow")
        return flow["returnTo"] if flow else None

    def finish(self, response: dict[str, str]) -> str:
        """Finishes signing in, for a state return_to knows, and gives the one-time code for the app. Raises
        SignInRefused if the tenant didn't sign anyone in."""
        flow_id = _flow_id(response.get("state", ""))
        flow = self._live(flow_id, "flow")
        if flow is None:
            raise SignInRefused("unknown_state")
        # A flow is used once, whatever happens.
        self._store.delete(flow_id)
        # Cancelled at the account choice, or refused by the tenant: there's no code to redeem.
        if "error" in response:
            raise SignInRefused(response["error"])
        account = self._entra.finish(flow["flow"], response)

        code = secrets.token_urlsafe(32)
        item: dict[str, Any] = {
            "id": hashed(code),
            "kind": "code",
            "objectId": account.object_id,
            "email": account.email,
            "name": account.name,
            "givenName": account.given_name,
            "expires": self._at(CODE_SECONDS),
            "ttl": CODE_SECONDS,
        }
        # An account that isn't the Household's gets a code too, for screen B, but its tokens aren't kept.
        if self._accounts.member_for(account.object_id) is not None:
            item["cache"] = account.cache
        self._store.put(item)
        return code

    def swap(self, code: str) -> Signed | None:
        """Swaps a one-time code for a session token, once. None if the code is unknown, used or expired."""
        code_id = hashed(code)
        item = self._live(code_id, "code")
        # Whoever deletes it first gets the session, so a code can't be swapped twice.
        if item is None or not self._store.delete(code_id):
            return None
        member_id = self._accounts.member_for(item["objectId"])
        if member_id is None or "cache" not in item:
            return Signed(kind="refused", email=item["email"])

        token = SESSION_PREFIX + secrets.token_urlsafe(32)
        now = self._now()
        self._store.put(
            {
                "id": hashed(token),
                "kind": "session",
                "memberId": member_id,
                "objectId": item["objectId"],
                "email": item["email"],
                "cache": item["cache"],
                "created": now,
                "checked": now,
                "ttl": SESSION_SECONDS,
            }
        )
        return Signed(
            kind="member",
            token=token,
            email=item["email"],
            object_id=item["objectId"],
            name=item.get("name", ""),
            given_name=item.get("givenName", ""),
        )

    def object_id(self, token: str) -> str:
        """The account a session token is for, refreshing its tokens from Entra if it's a day since they were.
        Raises NotSignedIn if it isn't a session, or Entra has refused it."""
        session_id = hashed(token)
        session = self._live(session_id, "session")
        if session is None:
            raise NotSignedIn()
        if self._clock() - datetime.fromisoformat(session["checked"]) >= CHECK_EVERY:
            try:
                cache = self._entra.refresh(session["cache"])
            except Exception:
                # Entra can't be reached, or turned down the backend itself (an expired secret): not the
                # Member's fault. Let them in, and ask again next time.
                logger.warning("Couldn't refresh a session's tokens from Entra.", exc_info=True)
            else:
                if cache is None:
                    self._store.delete(session_id)
                    raise NotSignedIn()
                self._store.put(session | {"cache": cache, "checked": self._now()})
        return session["objectId"]

    def end(self, token: str) -> None:
        """Ends a session. Ending one that's already gone is fine."""
        self._store.delete(hashed(token))

    def _live(self, item_id: str, kind: str) -> dict[str, Any] | None:
        item = self._store.get(item_id)
        if item is None or item.get("kind") != kind:
            return None
        # Cosmos DB hides an item past its ttl anyway; this holds for flows and codes without trusting that.
        expires = item.get("expires")
        if expires is not None and datetime.fromisoformat(expires) <= self._clock():
            return None
        return item

    def _now(self) -> str:
        return self._clock().isoformat()

    def _at(self, seconds: int) -> str:
        return (self._clock() + timedelta(seconds=seconds)).isoformat()


def _flow_id(state: str) -> str:
    # Hashed like the rest, and named apart from them, so a state can't be passed off as a code or a session.
    return "flow-" + hashed(state)


def sessions_from_environment(accounts: Accounts | None) -> Sessions | None:
    """Sessions from the app settings, or None until sign-in is set up: the tenant's details, the FamilyHub
    app registration's client ID and secret (a Key Vault reference), and Cosmos DB."""
    settings = EntraSettings.from_environment()
    client_id = os.environ.get("APP_CLIENT_ID", "").strip()
    secret = os.environ.get("APP_CLIENT_SECRET", "").strip()
    store = CosmosStore.from_environment()
    # An unresolved Key Vault reference is left as the reference itself, which is no secret.
    if secret.startswith("@Microsoft.KeyVault("):
        logger.warning("APP_CLIENT_SECRET is an unresolved Key Vault reference.")
        secret = ""
    if settings is None or not client_id or not secret or store is None or accounts is None:
        return None
    return Sessions(MsalEntra(settings, client_id, secret), store, accounts)

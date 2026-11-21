"""Sign-in: who's calling the API (ADR 0010, ADR 0014).

Members sign in to the family app with their own Google account through Entra External ID, and call the API
with a delegated access token carrying the Lists.ReadWrite scope. The Hub signs in as itself with a
certificate, and calls with an app-only token carrying the Hub app role. Either way, the token is checked
against the FamilyHub tenant's signing keys. A Member's account must also be on the Household's list, in
Cosmos DB's accounts container.

A missing or bad token is a 401. A good token that isn't allowed in is a 403.
"""

import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import jwt
from fastapi import HTTPException, Request, status

SCOPE = "Lists.ReadWrite"
HUB_ROLE = "Hub"


@dataclass(frozen=True)
class Caller:
    """Who's calling: a Member, by the id the Hub gave them, or the Hub itself."""

    kind: Literal["member", "hub"]
    member_id: str | None = None


@dataclass(frozen=True)
class EntraSettings:
    """The FamilyHub tenant's details, from app settings the pipeline fills in from its variable group."""

    tenant_id: str
    subdomain: str
    api_client_id: str

    @classmethod
    def from_environment(cls) -> "EntraSettings | None":
        """The settings, or None when sign-in hasn't been set up yet (the sign-in runbook, step 7)."""
        names = ("ENTRA_TENANT_ID", "ENTRA_SUBDOMAIN", "API_CLIENT_ID")
        values = [os.environ.get(name, "").strip() for name in names]
        return cls(*values) if all(values) else None

    @property
    def issuers(self) -> list[str]:
        # External ID's own issuer, on ciamlogin.com. Tokens got through login.microsoftonline.com name the
        # tenant there instead. Both are the same tenant, signed with the same keys.
        return [
            f"https://{self.tenant_id}.ciamlogin.com/{self.tenant_id}/v2.0",
            f"https://login.microsoftonline.com/{self.tenant_id}/v2.0",
        ]

    @property
    def jwks_url(self) -> str:
        return f"https://{self.subdomain}.ciamlogin.com/{self.tenant_id}/discovery/v2.0/keys"


class Accounts(Protocol):
    """The Household's list of accounts: which Member, if any, an account in the FamilyHub tenant is."""

    def member_for(self, object_id: str) -> str | None: ...


# Given a token, the public key it must be signed with.
SigningKeyFor = Callable[[str], Any]


class TokenChecker:
    """Checks an access token and says who it's for."""

    def __init__(self, settings: EntraSettings, signing_key_for: SigningKeyFor | None = None) -> None:
        self._settings = settings
        if signing_key_for is None:
            # Fetches the tenant's keys when it first needs them, and keeps them, fetching again for a key it
            # hasn't seen, as when Entra rolls its keys.
            keys = jwt.PyJWKClient(settings.jwks_url, cache_keys=True)
            signing_key_for = lambda token: keys.get_signing_key_from_jwt(token).key  # noqa: E731
        self._signing_key_for = signing_key_for

    def claims(self, token: str) -> dict[str, Any]:
        """The token's claims, if it's genuine, unexpired and for this API, or a jwt.PyJWTError."""
        claims = jwt.decode(
            token,
            self._signing_key_for(token),
            algorithms=["RS256"],
            audience=self._settings.api_client_id,
            issuer=self._settings.issuers,
            options={"require": ["exp", "iat", "iss", "aud", "tid", "oid"]},
            leeway=60,
        )
        if claims["tid"] != self._settings.tenant_id:
            raise jwt.InvalidTokenError("The token is from another tenant.")
        return claims


def caller_from(claims: dict[str, Any], accounts: Accounts) -> Caller:
    """Who the claims say is calling, or a 403 if they aren't allowed in."""
    if "scp" in claims:
        # A delegated token: a person, signed in through the family app.
        if SCOPE not in str(claims["scp"]).split():
            raise _forbidden("The token doesn't allow reading and changing the lists.")
        member_id = accounts.member_for(claims["oid"])
        if member_id is None:
            raise _forbidden("This account isn't one of the Household's.")
        return Caller(kind="member", member_id=member_id)

    # An app-only token: only the Hub's registration has the Hub role.
    if HUB_ROLE in claims.get("roles", []):
        return Caller(kind="hub")
    raise _forbidden("The token doesn't allow reading and changing the lists.")


class SignIn:
    """A FastAPI dependency: the caller of a request, or a 401 or 403. With no checker, sign-in isn't set up
    yet, and every request that needs it gets a 503."""

    def __init__(self, checker: TokenChecker | None, accounts: Accounts | None) -> None:
        self._checker = checker
        self._accounts = accounts

    def __call__(self, request: Request) -> Caller:
        if self._checker is None or self._accounts is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Sign-in isn't set up yet.")
        token = _bearer_token(request)
        try:
            claims = self._checker.claims(token)
        except jwt.PyJWKClientConnectionError as error:
            # The tenant's keys couldn't be fetched: not the caller's fault.
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "Can't check sign-ins right now."
            ) from error
        except jwt.PyJWTError as error:
            raise _unauthorized("The sign-in isn't valid. Sign in again.") from error
        return caller_from(claims, self._accounts)


def _bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Sign in first.")
    return token.strip()


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail)

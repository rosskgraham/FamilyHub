"""Live updates through Web PubSub (design/family-app/notes.md, How sync works).

Clients connect to Web PubSub, with a URL from GET /live, and the API tells every connection when a list has
changed: {"list": "shopping", "seq": 12}. Never the change itself, so a missed message costs nothing: the
client catches up from its last seq when it next asks. Every list's messages go to every connection, through
one hub.
"""

import os
from typing import Protocol

from azure.identity import DefaultAzureCredential
from azure.messaging.webpubsubservice import WebPubSubServiceClient

HUB = "familyhub"

# How long a client URL's token lasts. It's checked when connecting, and a client asks for a new URL whenever
# it reconnects.
TOKEN_MINUTES = 60

# Telling clients is never worth holding up a save for long: a short timeout, and no retry, as a client that
# misses the message catches up anyway.
TIMEOUT_SECONDS = 5


class Live(Protocol):
    def client_url(self) -> str:
        """A URL a client can connect to, with an access token in it."""
        ...

    def changed(self, list_id: str, seq: int) -> None:
        """Tells every connection the list changed, up to seq. Raises if it couldn't."""
        ...


class WebPubSubLive:
    """Web PubSub, signed in to with the function app's managed identity, as its keys are off. Connects the
    first time it's needed, so a problem reaching it fails that request, not the app's start."""

    def __init__(self, endpoint: str) -> None:
        self._endpoint = endpoint
        self._client: WebPubSubServiceClient | None = None

    @classmethod
    def from_environment(cls) -> "WebPubSubLive | None":
        """None when it isn't configured, as on the PC."""
        endpoint = os.environ.get("WEBPUBSUB_ENDPOINT", "").strip()
        return cls(endpoint) if endpoint else None

    def _service(self) -> WebPubSubServiceClient:
        if self._client is None:
            self._client = WebPubSubServiceClient(
                endpoint=self._endpoint,
                hub=HUB,
                credential=DefaultAzureCredential(),
                retry_total=0,
                connection_timeout=TIMEOUT_SECONDS,
                read_timeout=TIMEOUT_SECONDS,
            )
        return self._client

    def client_url(self) -> str:
        # With keys off, the token is made by Web PubSub's own API rather than signed here.
        return self._service().get_client_access_token(minutes_to_expire=TOKEN_MINUTES)["url"]

    def changed(self, list_id: str, seq: int) -> None:
        self._service().send_to_all({"list": list_id, "seq": seq}, content_type="application/json")

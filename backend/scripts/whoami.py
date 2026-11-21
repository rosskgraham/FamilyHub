"""Signs in to the FamilyHub tenant and asks the API who it thinks you are, for checking sign-in by hand.

    uv run python scripts/whoami.py member   # a browser opens: sign in with Google
    uv run python scripts/whoami.py hub      # signs in as the Hub, with its certificate from the Key Vault

It reads these environment variables (the sign-in runbook, steps 7 and 8, has the values):

    FAMILYHUB_API_URL            the function app, such as https://func-familyhub-xxxxxx.azurewebsites.net
    FAMILYHUB_ENTRA_TENANT_ID    the FamilyHub tenant's ID
    FAMILYHUB_ENTRA_SUBDOMAIN    its subdomain, as in <subdomain>.ciamlogin.com
    FAMILYHUB_API_CLIENT_ID      the FamilyHub API registration's client ID
    FAMILYHUB_APP_CLIENT_ID      member: the FamilyHub app registration's client ID
    FAMILYHUB_HUB_CLIENT_ID      hub: the FamilyHub Hub registration's client ID
    FAMILYHUB_KEY_VAULT          hub: the Key Vault's name; az must be signed in as Ross

Nothing is kept: the token and the certificate are thrown away when it finishes.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import msal


def setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Set {name} first. See the top of this script.")
    return value


def member_token(authority: str, api_client_id: str) -> dict:
    app = msal.PublicClientApplication(setting("FAMILYHUB_APP_CLIENT_ID"), authority=authority)
    # Needs http://localhost as a "Mobile and desktop applications" redirect URI on FamilyHub app.
    return app.acquire_token_interactive(
        scopes=[f"api://{api_client_id}/Lists.ReadWrite"], prompt="select_account"
    )


def hub_token(authority: str, api_client_id: str) -> dict:
    vault = setting("FAMILYHUB_KEY_VAULT")
    az = shutil.which("az") or sys.exit("The Azure CLI isn't installed.")
    with tempfile.TemporaryDirectory() as folder:
        pfx = Path(folder) / "hub.pfx"
        # The certificate's secret holds the private key too, as a PFX.
        subprocess.run(
            [az, "keyvault", "secret", "download", "--vault-name", vault, "--name", "hub-entra-certificate"]
            + ["--encoding", "base64", "--file", str(pfx)],
            check=True,
        )
        app = msal.ConfidentialClientApplication(
            setting("FAMILYHUB_HUB_CLIENT_ID"),
            authority=authority,
            client_credential={"private_key_pfx_path": str(pfx)},
        )
        return app.acquire_token_for_client(scopes=[f"api://{api_client_id}/.default"])


def main() -> None:
    who = sys.argv[1] if len(sys.argv) == 2 else ""
    if who not in ("member", "hub"):
        sys.exit("Usage: whoami.py member|hub")

    api_url = setting("FAMILYHUB_API_URL").rstrip("/")
    tenant_id = setting("FAMILYHUB_ENTRA_TENANT_ID")
    authority = f"https://{setting('FAMILYHUB_ENTRA_SUBDOMAIN')}.ciamlogin.com/{tenant_id}"
    api_client_id = setting("FAMILYHUB_API_CLIENT_ID")

    result = (member_token if who == "member" else hub_token)(authority, api_client_id)
    if "access_token" not in result:
        sys.exit(f"Signing in failed: {result.get('error')}: {result.get('error_description')}")

    request = urllib.request.Request(
        f"{api_url}/me", headers={"Authorization": f"Bearer {result['access_token']}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            print(response.status, json.loads(response.read()))
    except urllib.error.HTTPError as error:
        print(error.code, error.read().decode(errors="replace"))


if __name__ == "__main__":
    main()

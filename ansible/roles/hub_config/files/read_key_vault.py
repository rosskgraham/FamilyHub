#!/usr/bin/env python3
"""Prints the named secrets from the Hub's Key Vault as one JSON object, leaving out any the vault hasn't got.

Runs on the PC, never on the Pi, signed in with `az login` as the person ADR 0008 lets read the secrets. The vault
is $FAMILYHUB_KEY_VAULT, or else the one in the rg-familyhub resource group. The values are secrets: the playbook
hides this script's output.

    read_key_vault.py google-client-id household-json ...
    {"vault": "kv-familyhub-abc123", "secrets": {"google-client-id": "...", "household-json": "..."}}
"""

import json
import os
import subprocess
import sys

RESOURCE_GROUP = "rg-familyhub"


def az(*args: str):
    try:
        result = subprocess.run(["az", *args, "--output", "json"], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        sys.exit("The Azure CLI isn't installed on this PC. See the Pi runbook, step 5.")
    if result.returncode != 0:
        problem = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "no message"
        if "az login" in result.stderr:
            sys.exit("The Azure CLI isn't signed in. Run `az login`, then try again.")
        sys.exit(f"`az {' '.join(args[:3])}` failed: {problem}")
    return json.loads(result.stdout) if result.stdout.strip() else None


def main() -> None:
    vault = os.environ.get("FAMILYHUB_KEY_VAULT") or az(
        "keyvault", "list", "--resource-group", RESOURCE_GROUP, "--query", "[0].name"
    )
    if not vault:
        sys.exit(f"There's no Key Vault in {RESOURCE_GROUP} yet. See the Azure runbook, or skip this with --skip-tags config.")
    existing = set(az("keyvault", "secret", "list", "--vault-name", vault, "--query", "[].name") or [])
    secrets = {
        name: az("keyvault", "secret", "show", "--vault-name", vault, "--name", name, "--query", "value")
        for name in sys.argv[1:]
        if name in existing
    }
    print(json.dumps({"vault": vault, "secrets": secrets}))


if __name__ == "__main__":
    main()

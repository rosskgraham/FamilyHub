#!/usr/bin/env python3
"""A pretend Azure CLI for the tests: the few `az keyvault` commands read_key_vault.py uses, answered from
key_vault.json beside it, standing in for the real Key Vault. run.sh puts it on the stand-in's PATH as `az`, and sets
FAMILYHUB_FAKE_VAULT to answer from another file instead."""

import json
import os
import sys
from pathlib import Path

vault_file = os.environ.get("FAMILYHUB_FAKE_VAULT") or Path(__file__).resolve().parent / "key_vault.json"
vault = json.loads(Path(vault_file).read_text())
args = sys.argv[1:]


def option(name: str) -> str:
    return args[args.index(name) + 1] if name in args else ""


# The PC's default subscription may be another project's, so every command has to name FamilyHub's.
if option("--subscription") != "FamilyHub":
    sys.exit(f"ERROR: fake az was asked about subscription {option('--subscription') or '(the default)'}, not FamilyHub")

if args[:2] == ["keyvault", "list"]:
    answer = vault["name"]
elif args[:3] == ["keyvault", "secret", "list"]:
    answer = list(vault["secrets"])
elif args[:3] == ["keyvault", "secret", "show"]:
    name = option("--name")
    if name not in vault["secrets"]:
        sys.exit(f"ERROR: (SecretNotFound) A secret with (name/id) {name} was not found in this key vault.")
    answer = vault["secrets"][name]
else:
    sys.exit(f"fake az doesn't know: az {' '.join(args)}")
print(json.dumps(answer))

#!/usr/bin/env python3
"""A pretend Azure CLI for the tests: the few `az keyvault` commands read_key_vault.py uses, answered from
key_vault.json beside it, standing in for the real Key Vault. run.sh puts it on the stand-in's PATH as `az`."""

import json
import sys
from pathlib import Path

vault = json.loads((Path(__file__).resolve().parent / "key_vault.json").read_text())
args = sys.argv[1:]


def option(name: str) -> str:
    return args[args.index(name) + 1]


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

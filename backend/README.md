# FamilyHub API

The family app's backend ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): a Python FastAPI app, run in Azure by Functions Flex Consumption ([ADR 0011](../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)). The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it's the skeleton from slice 1: `/health`, sign-in, and `/me`, deployed by the pipeline.

## Sign-in

Members sign in with their own Google account through Microsoft Entra External ID, and call the API with an access token for the `Lists.ReadWrite` scope. The Hub signs in as itself, with a certificate, and its app-only token carries the `Hub` app role. The API checks each token's signature against the FamilyHub tenant's keys, its issuer, audience and expiry, then the scope or role. A Member must also have an item in Cosmos DB's `accounts` container, from their Object ID to their Member id on the Hub ([ADR 0014](../docs/adr/0014-household-accounts-in-cosmos-db.md)).

- `GET /me` says who the caller is: `{"kind": "member", "member_id": "…"}` or `{"kind": "hub", "member_id": null}`.
- No token, or a bad one, is a 401. A good token for an account not on the list, or without the scope or role, is a 403. Before the tenant's details are set (the app settings `ENTRA_TENANT_ID`, `ENTRA_SUBDOMAIN` and `API_CLIENT_ID`), it's a 503.
- `/health` needs no sign-in.

The tenant is set up by hand, as the [sign-in runbook](../docs/runbooks/sign-in-setup.md) says. `scripts/whoami.py` signs in as a Member or the Hub and calls `/me`, to check it by hand.

## What's here

- `familyhub_api/`: the FastAPI app, with no Azure Functions in sight, so it runs and is tested as a plain FastAPI service. `main.py` has the routes, `auth.py` checks tokens, and `accounts.py` reads the Household's accounts from Cosmos DB.
- `function_app.py`: the Azure Functions entry point. `AsgiFunctionApp` hands every HTTP request to the FastAPI app.
- `host.json`: the Functions host's settings. Routes have no `/api` prefix, so it's `/health`, not `/api/health`.
- `tests/`: pytest tests, run with FastAPI's test client. Sign-in's tests sign their own tokens with a key made for the test, and use a stand-in for Cosmos DB.
- `scripts/`: tools for checking by hand, not deployed.
- `pyproject.toml` and `uv.lock`: the dependencies, managed with [uv](https://docs.astral.sh/uv/). The pipeline makes `requirements.txt` from `uv.lock` for the deploy, as Flex builds the app from that.

## Run it on the PC

You need Python 3.12, as the function app runs, and uv.

```
cd backend
uv sync
uv run pytest
uv run --with "fastapi[standard]" fastapi dev familyhub_api/main.py
```

Then <http://127.0.0.1:8000/health> answers, and it reloads when the code changes.

## Lint and formatting

[Ruff](https://docs.astral.sh/ruff/) lints and formats the code, with the rules in `pyproject.toml`. It's enforced in three places:

- **Before each commit,** by a [pre-commit](https://pre-commit.com) hook ([`.pre-commit-config.yaml`](../.pre-commit-config.yaml)) that runs ruff on staged backend files, fixing what it can. A commit it fixes stops, so the change can be checked and added. Set it up once per clone, from the repo root:

  ```
  uv tool install pre-commit
  pre-commit install
  ```

- **On every pull request,** by the `backend` job in GitHub Actions CI, a required check, so a pull request with lint errors can't merge.
- **Before deploying,** by the Azure DevOps pipeline.

The hook runs ruff through uv, so it's the version locked in `uv.lock`, the same as CI. To run it by hand: `uv run ruff check .` and `uv run ruff format .`.

## Deploying

A merge to `main` that touches `backend/` or `infra/` runs the pipeline ([`infra/azure-pipelines.yml`](../infra/azure-pipelines.yml)): it deploys the Bicep, then zips this folder's source with `requirements.txt` and deploys it to the function app, which builds it. Then it checks that `/health` answers.

## Measuring cold starts

Flex scales to zero after a quiet spell, and Microsoft doesn't say how long that takes, or how long a cold start is. `/health` returns `started_at`, when the process started, so a new `started_at` means that request had a cold start. To measure:

- **The wait before scaling to zero:** call `/health` after longer and longer quiet spells (5, 10, 15, 20, 30 minutes), and note the shortest one after which `started_at` changes.
- **The cold start:** time the requests whose `started_at` changed, against ones that didn't. For example: `curl -s -o /dev/null -w '%{time_total}\n' https://<function app>.azurewebsites.net/health`.

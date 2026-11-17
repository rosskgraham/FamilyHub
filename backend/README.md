# FamilyHub API

The family app's backend ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): a Python FastAPI app, run in Azure by Functions Flex Consumption ([ADR 0011](../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)). The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it's the skeleton from slice 1: `/health`, deployed by the pipeline.

## What's here

- `familyhub_api/main.py`: the FastAPI app. Everything the API does lives here, with no Azure Functions in sight, so it runs and is tested as a plain FastAPI service.
- `function_app.py`: the Azure Functions entry point. `AsgiFunctionApp` hands every HTTP request to the FastAPI app.
- `host.json`: the Functions host's settings. Routes have no `/api` prefix, so it's `/health`, not `/api/health`.
- `tests/`: pytest tests, run with FastAPI's test client.
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

Before a pull request, also run `uv run ruff check .` and `uv run ruff format --check .`, which the pipeline runs too.

## Deploying

A merge to `main` that touches `backend/` or `infra/` runs the pipeline ([`infra/azure-pipelines.yml`](../infra/azure-pipelines.yml)): it deploys the Bicep, then zips this folder's source with `requirements.txt` and deploys it to the function app, which builds it. Then it checks that `/health` answers.

## Measuring cold starts

Flex scales to zero after a quiet spell, and Microsoft doesn't say how long that takes, or how long a cold start is. `/health` returns `started_at`, when the process started, so a new `started_at` means that request had a cold start. To measure:

- **The wait before scaling to zero:** call `/health` after longer and longer quiet spells (5, 10, 15, 20, 30 minutes), and note the shortest one after which `started_at` changes.
- **The cold start:** time the requests whose `started_at` changed, against ones that didn't. For example: `curl -s -o /dev/null -w '%{time_total}\n' https://<function app>.azurewebsites.net/health`.

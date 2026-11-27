# FamilyHub API

The family app's backend ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): a Python FastAPI app, run in Azure by Functions Flex Consumption ([ADR 0011](../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)). The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it's the skeleton from slice 1 (`/health`, sign-in, and `/me`, deployed by the pipeline) and slice 2's Shopping list: its operations, log, catch-up and live updates, and its Shops, each learning a walking order (#84).

## Sign-in

Members sign in with their own Google account through Microsoft Entra External ID. The backend holds their sign-in as a confidential client, and gives each phone a FamilyHub session token ([ADR 0016](../docs/adr/0016-sign-in-held-by-the-backend.md), below). Scripts can call with an Entra access token for the `Lists.ReadWrite` scope instead. The Hub signs in as itself, with a certificate, and its app-only token carries the `Hub` app role. The API checks each token's signature against the FamilyHub tenant's keys, its issuer, audience and expiry, then the scope or role. A Member must also have an item in Cosmos DB's `accounts` container, from their Object ID to their Member id on the Hub ([ADR 0014](../docs/adr/0014-household-accounts-in-cosmos-db.md)).

- A session token is checked against Cosmos DB's `sessions` container, by its hash, and stands for the Member whose account it is. Either way, the account must still be on the list, on every call.
- `GET /me` says who the caller is: `{"kind": "member", "member_id": "…"}` or `{"kind": "hub", "member_id": null}`.
- No token, or a bad one, is a 401. A good token for an account not on the list, or without the scope or role, is a 403. Before the tenant's details are set (the app settings `ENTRA_TENANT_ID`, `ENTRA_SUBDOMAIN` and `API_CLIENT_ID`), it's a 503.
- `/health` needs no sign-in.
- The family app calls from another origin, its Static Web Apps address, so the API answers CORS for that and `http://localhost:5173` only. In Azure that's the function app's own CORS setting, in `infra/backend.bicep`: the Functions host answers the browser's preflight itself, before FastAPI sees it. On a PC, set `ALLOWED_ORIGINS` (comma-separated) and FastAPI answers instead, allowing `GET`, `POST` and `DELETE` with `Authorization`. Never both, as the header would be sent twice, and never cookies.

### Sessions

The FamilyHub app registration signs Members in as a confidential client, with its secret from the Key Vault (the app setting `APP_CLIENT_SECRET` is a Key Vault reference, and `APP_CLIENT_ID` is its client ID). Without either, or Cosmos DB, the routes below say 503.

- `GET /auth/sign-in?return_to=<the family app's origin>` sends the browser to the tenant, with an authorisation code flow and PKCE, asking which Google account. `return_to` must be one of `FAMILY_APP_ORIGINS` (on a PC, `ALLOWED_ORIGINS` too), or it's a 400.
- The tenant posts the code to `/auth/callback`, at the API's own address (`WEBSITE_HOSTNAME` in Azure; on a PC, wherever the request came). It redeems the code with the secret and sends the browser to `<return_to>/auth/done?code=<one-time code>`, or `?error=<why>` when it was cancelled or failed. A state works once, for 10 minutes.
- `POST /auth/session` with `{"code": "…"}` swaps the code, once and within 2 minutes, for `{"kind": "member", "token": "fhs_…", "object_id": "…", "email": "…", "name": "…", "given_name": "…"}` (who signed in, from the ID token, for the app to keep its copy under and greet them by), or `{"kind": "refused", "email": "…"}` for an account that isn't the Household's, with no session and none of its tokens kept.
- At most once a day, a call with a session refreshes its tokens from Entra. If Entra says the sign-in is over (90 days unused, or revoked in the tenant), the session ends and the call is a 401. If Entra can't be reached, or turns down the backend's own secret, the call goes ahead and it's asked again next time.
- `DELETE /sessions/current` ends the session in the `Authorization` header: 204, even if it had already gone.
- `scripts/sessions.py` lists a Member's sessions and ends one or all of them, for a lost or replaced phone.

The tenant is set up by hand, as the [sign-in runbook](../docs/runbooks/sign-in-setup.md) says. `scripts/whoami.py` signs in as a Member or the Hub and calls `/me`, to check it by hand. `scripts/accounts.py` lists, adds and removes the Household's accounts, finding each one in the tenant by its Google address.

## The Shopping list

Both endpoints need sign-in, as a Member or the Hub, and either can do everything.

- `POST /lists/shopping/operations` takes `{"operations": [...]}`, at most 100, each one of:
  - `{"id": "<uuid>", "type": "add", "item_id": "<uuid>", "text": "Milk"}`
  - `{"id": "<uuid>", "type": "tick" | "untick" | "remove", "item_id": "<uuid>"}`
  - `{"id": "<uuid>", "type": "rename", "item_id": "<uuid>", "text": "Oat milk"}`
  - `{"id": "<uuid>", "type": "add_shop", "shop_id": "<uuid>", "name": "Aldi"}`: a Shop the list can be sorted for (#84). The name is trimmed and must be 1 to 50 characters. A shop id already used isn't added again.
  - `{"id": "<uuid>", "type": "place", "shop_id": "<uuid>", "name": "Plasters", "after": "Cheddar"}`: teaches a Shop its walking order. The name is taken out of the Shop's order and put back straight after `after`, or at the start if `after` is left out or isn't in the order yet. Placing in a Shop that doesn't exist, or a place that leaves the order as it was, changes nothing. A Shop keeps at most 500 names; placing one more drops the name placed longest ago.

  Names in a Shop's order are matched lowercase, trimmed, with runs of spaces collapsed and trailing punctuation stripped, so "Milk", " milk " and "Milk." are one name. Plurals aren't merged. The ids are made on the device. Text is trimmed and must be 1 to 200 characters. They're applied in order, and the answer is `{"results": [{"id": "…", "seq": 12, "changed": true}, ...]}`. Sending an operation again gets the same answer and changes nothing. Anything invalid is a 422, and none of the batch is applied.
- `GET /lists/shopping/items?after=N` answers `{"items": [...], "shops": [...], "seq": 14}`: every item changed after sequence number N, each with its `id`, `text`, `ticked_off`, `ticked_off_at`, `removed`, `seq` and `added_seq`, the number it was added at, which devices order the list by, newest first (items stored before it was kept give their `seq`). A removed item comes as a marker, with `removed` true, for devices to drop. With `after=0`, it's what a device starting from nothing needs: the items still to get, and those ticked off in the last 10 minutes. It also gives the Shops changed after N (every Shop with `after=0`), each with its `id`, `name`, `order` (the matched names, first to last) and `seq`. Ask for everything after `seq` next time. An item or Shop may come twice, which does no harm.

The server decides how operations merge. Removing beats anything later: a removed item never comes back. Ticked-off and the text are separate, so changing one never undoes the other. Otherwise the latest to arrive wins.

Everything is in Cosmos DB's `lists` container, one partition per list (`listId` `shopping`): a counter, an item per item, a document per Shop, and the log of every operation with its number, when it arrived and who sent it (`sentBy`: a Member's id, or `hub`). Each operation is written with the counter and the item or Shop in one transactional batch, and tried again if another request wrote first. If Cosmos DB can't be reached, or is too busy, it's a 503. The operations before the one that failed are kept, so a client resends the whole batch, which is safe: the ones already applied aren't applied again.

## Live updates

Devices hear about a change made elsewhere within about a second, through Azure Web PubSub, rather than asking over and over.

- `GET /live`, signed in as a Member or the Hub, answers `{"url": "wss://…"}`: a Web PubSub client URL for the `familyhub` hub, with an access token that lasts 60 minutes. Connect a plain WebSocket to it. To reconnect, ask for a new URL.
- After a batch of operations that changed something, every connection gets one message: `{"list": "shopping", "seq": 12}`, the highest number the batch changed. Then fetch `GET /lists/shopping/items?after=<your last seq>`. Ignore lists you don't show.
- A batch that changed nothing, such as a resend, sends nothing. A batch that failed partway still sends a message for what it saved.
- The message is never the change itself, so a missed one costs nothing: the next catch-up gets it. Sending it has a 5-second timeout and no retry, and if it fails, the batch is still saved and answered, and the failure is logged.
- Without `WEBPUBSUB_ENDPOINT`, as on the PC, `GET /live` is a 503 and no messages are sent.

Web PubSub's keys are off, so the API makes each token through Web PubSub's own API, with the function app's managed identity and its Web PubSub Service Owner role. The free tier allows 20 connections at once and 20,000 messages a day, each message to each connection counting once. Past a limit, connections or messages are refused, not charged for.

`scripts/shopping.py` signs in as `whoami.py` does, and lists the Shopping list, runs through every operation with test items, or listens for live updates while making a change (`live`), to check it by hand. `clear` removes every item and keeps Shops, to start the list again (AB#103).

## What's here

- `familyhub_api/`: the FastAPI app, with no Azure Functions in sight, so it runs and is tested as a plain FastAPI service. `main.py` has the routes, `auth.py` checks tokens, `sessions.py` signs Members in and keeps their sessions, `accounts.py` reads the Household's accounts from Cosmos DB, `lists.py` has the lists' operations and rules, `cosmos_lists.py` keeps them in Cosmos DB, and `live.py` sends live updates through Web PubSub.
- `function_app.py`: the Azure Functions entry point. `AsgiFunctionApp` hands every HTTP request to the FastAPI app.
- `host.json`: the Functions host's settings. Routes have no `/api` prefix, so it's `/health`, not `/api/health`.
- `tests/`: pytest tests, run with FastAPI's test client. Sign-in's tests sign their own tokens with a key made for the test. The tests use stand-ins for Cosmos DB, the lists' one refusing clashing writes as a transactional batch would.
- `scripts/`: tools for checking and running the backend by hand, not deployed.
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

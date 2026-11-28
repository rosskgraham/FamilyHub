# The family app and its backend: design notes

A proposal, started 16 November 2026, to move the Shopping list and To-dos off Google Tasks into a backend of the Hub's own in Azure, with an installable web app for the Household's phones beside it. The decisions so far are recorded in ADR 0010 and ADR 0011. Building started on 17 November 2026 with slice 1, in [`backend/`](../../backend/README.md) and [`infra/`](../../infra/README.md).

## The idea

Today the Shopping list and To-dos are Google Tasks lists in the Household's one Google account ([ADR 0003](../../docs/adr/0003-shopping-list-in-google-tasks.md), [To-dos notes](../mockups/todos/notes.md)). Google Tasks lists can't be shared between personal Google accounts, so every phone has to be signed in to the Household's account to use them. The Tasks API also hides repeats: it can't create a repeating To-do, and can't show one before it's due.

Instead, the lists live in a backend in Azure. Each Member signs in to the family app on their own phone, as themselves. The Hub is one more client of the backend. Phones and the Hub each keep a copy, so the Shopping list still works in a shop with no signal, and the Hub still works when the internet's down.

This is the interesting path on purpose. Simpler ones are listed under Considered Options.

## Decided

- **Android only** (16 November 2026). Everyone in the Household has an Android phone.
- **The family app is an installable web app** (16 November 2026), not a store app: open its address in Chrome and tap Install. No Google Play, no APKs. It updates itself.
- **It's built with SvelteKit**, like the Hub, so it can share the Hub's components, colours and fonts.
- **The backend is Python** (16 November 2026).
- **It runs on Azure Functions Flex Consumption** (17 November 2026, [ADR 0011](../../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)), replacing App Service's Free plan (F1), chosen the day before. It's the same FastAPI app, run through `AsgiFunctionApp`. Flex has no daily CPU stop and stays inside its free grant, but its storage account costs pennies a month, which Ross approved.
- **Saving stays synchronous** (17 November 2026). Changes must be applied in order, and Storage queues and Service Bus Basic don't keep it. Service Bus Standard does, with sessions, but costs about $10 a month. A Storage queue carries only side jobs: Web Push, the Tasks import, and timers.
- **Data is in Cosmos DB, on its free tier** (16 November 2026). Azure SQL's free offer and Azure's Postgres don't fit a free tier (see Considered Options).
- **Backups are Cosmos DB's periodic backup** (22 November 2026), not a nightly export to Google Drive like Chores (ADR 0006): once a day, kept two days, the two copies that are free. A broken list noticed up to two days later can be restored, by a support request to Microsoft, losing up to a day's changes.
- **Every Member gets an account, the children included** (16 November 2026). The children have Google accounts on devices of their own, so everyone signs in as themselves.
- **Children can do everything grown-ups can** on the Shopping list and To-dos (16 November 2026).
- **Only the Household's accounts get in.** The backend keeps a list of which account is which Member, in Cosmos DB's `accounts` container (decided 21 November 2026, [ADR 0014](../../docs/adr/0014-household-accounts-in-cosmos-db.md), replacing the Key Vault). Each account is named by its Object ID in the External ID tenant, and points at the Member's id on the Hub. Any other account that signs in gets a 403.
- **The app is at Static Web Apps' free `*.azurestaticapps.net` address** (16 November 2026), not a domain of the Household's own. Azure picks the name when the app is created, and it changes if the app is ever deleted and made again, which means installing it again on each phone.
- **The server decides.** As the backend is Python and the clients are TypeScript, merge rules and repeats live only on the server, so nothing is written twice. Clients queue changes, send them when they can, and show what the server says. That's how the Hub's Tasks queue already works (`app/src/lib/server/tasks/queue.ts`).

## Proposed architecture

```
 Phones (installed web app)          Azure (Bicep, ADR 0008)                     Pi (the Hub)
 ┌──────────────────┐   HTTPS +    ┌──────────────────────────────┐  outbound   ┌──────────────────┐
 │ IndexedDB copy,  │◄──realtime──►│ API on Functions (Flex)      │◄──only────► │ SQLite copy      │
 │ service worker:  │              │ (FastAPI, scales to zero)    │             │ keeps working    │
 │ opens and works  │              │ Cosmos DB free tier          │             │ when internet's  │
 │ offline in the   │              │ Web PubSub (live updates)    │             │ down; still no   │
 │ shop             │◄──Web Push───│ Entra External ID (sign-in)  │             │ open port        │
 └──────────────────┘              │ Static Web Apps (the app)    │             └──────────────────┘
                                   └──────────────────────────────┘
```

| Part | Proposal | Free allowance (checked 16 November 2026) |
|---|---|---|
| The app's files | Azure Static Web Apps, free tier, with free HTTPS, which installable web apps need | Free plan: 100 GB a month of bandwidth with no overage, 250 MB per app, 10 apps per subscription. Its own sign-in only offers preconfigured providers, not Google, which is why the app signs in with MSAL instead |
| API | Python, FastAPI and Pydantic, in a function app on Azure Functions Flex Consumption, with `AsgiFunctionApp` passing HTTP requests to FastAPI. Deployed as a zip package to the storage account, so there's no container image or registry. 512 MB instances, at most 1 instance (checked 17 November 2026) | 250,000 executions and 100,000 GB-seconds a month, per subscription. Each execution is billed as at least 1 second. About 9,000 to 10,000 executions a month is about 4% of the executions and 5% of the GB-seconds. Scales to zero when idle. The storage account it needs isn't in the grant: standard rates, pennies a month, approved |
| Side jobs | A Storage queue on the function app's storage account, read by queue-triggered functions in the same app: Web Push, the Tasks import, timers | Counted in the same grant, plus the storage account's transactions |
| Cost guard | A Cost Management budget of £5 a month that emails when it's passed (decided 17 November 2026). Spending is expected never to go past the storage account's pennies, so any alert means something is wrong | Free |
| Data | Cosmos DB for NoSQL, free tier, read with `azure-cosmos` | 1000 RU/s and 25 GB for the account's lifetime, one free account per subscription, opted into when it's created. Serverless accounts aren't eligible, so it uses provisioned throughput, shared across the database's containers |
| Live updates | Azure Web PubSub, free tier: the server tells clients something changed, and they fetch it | 20 concurrent connections and 20,000 messages a day, counting only messages it sends out. Each open app and the Hub is one connection |
| Notifications | Web Push, sent by the API with `pywebpush` | Free: no Firebase or Notification Hubs |
| Sign-in | Microsoft Entra External ID, with Google as the way in, so each Member uses their own Google account. MSAL in the app | The first 50,000 monthly active users. Google sign-in needs only a free Google Cloud client |
| Telemetry | Application Insights, as the Hub already uses ([ADR 0005](../../docs/adr/0005-telemetry-via-otel-collector-to-app-insights.md)) | Inside the existing daily cap |
| Infrastructure | Bicep in `infra/`, deployed by the Azure DevOps pipeline ([ADR 0008](../../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)) | — |

Every part stays on a free tier, as ADR 0008 requires, except the function app's storage account, which Ross approved on 17 November 2026. The API signs in to the database, Web PubSub and its storage account with the function app's managed identity, so there's no password anywhere.

## The family app

- **Installing:** open its address in Chrome on the phone and tap Install. It gets an icon on the home screen and opens full-screen.
- **Offline:** a service worker keeps the app itself on the phone, so it opens with no signal. The lists are in IndexedDB, and changes wait in a queue until the phone's back online.
- **Updates:** a new release reaches each phone the next time the app opens.
- **Its address is public**, at `*.azurestaticapps.net`. Only the app's files are public. The lists are behind sign-in, in the API.
- **Sign-in happened in the app** at first, with MSAL against Entra External ID. Static Web Apps' own sign-in on the free tier doesn't offer Google.
- **A single-page app's sign-in lasts 24 hours before renewing** (decided 23 November 2026). Entra gives a single-page app a 24-hour refresh token; after that MSAL renews through the tenant's session in a hidden frame, or asks to sign in again. Built that way and measured on Ross's phone: it asked him to sign in again every day (26 November 2026, AB#56).
- **So sign-in is held by the backend** (decided 26 November 2026, [ADR 0016](../../docs/adr/0016-sign-in-held-by-the-backend.md)). The backend signs Members in as a confidential client, keeps their Entra tokens, refreshing them at most once a day, and gives each phone a FamilyHub session token. Entra's refresh token slides for 90 days, so a phone in use stays signed in. The backend is AB#93, and the app moved over in AB#94, with MSAL gone from it.

## How sync works

- **Every change is an operation** with an ID made on the device: add an item, tick it off, untick it, rename it, remove it. The device keeps it in a queue until the server confirms it, so sending it twice does no harm.
- **Items' IDs are made on the device too** (decided 22 November 2026), so an item added offline needs no ID swapping when it reaches the server, as the Hub's Google Tasks queue needs now.
- **The server applies operations in the order it receives them**, and keeps them in Cosmos DB with a sequence number. A client asks for "everything after number N", so catching up after a day offline is one request. The answer is the items' states as they are now, not the operations, so clients never merge anything: `GET /lists/shopping/items?after=N`. From 0, it's what a device starting from nothing needs: the items still to get and those ticked off in the last 10 minutes.
- **Each list is one partition** of Cosmos DB's `lists` container, holding its counter, its items and its log of operations. An operation is written with the counter and the item in one transactional batch, the counter only if it hasn't changed since it was read, so no two operations share a number. If another request wrote first, the operation is tried again. The log keeps who sent each operation and when, and the item's text, for recent items later.
- **The API tells Web PubSub "something changed"** while it's handling the change, after saving it. Not Cosmos DB's change feed, which would need something running all the time to watch it.
- **Conflicts are settled per field**, latest write wins, with two rules where that's wrong. Removing beats editing: an item removed at home doesn't come back because someone ticked it in the shop. And ticking off is kept apart from the item's text. An operation that changes nothing, such as ticking an item already ticked, still gets a number and is logged.
- **Shops and their walking order are in the Shopping list's partition too** (decided 25 November 2026, AB#84, AB#85): one document per Shop, changed by two more operations, `add_shop` and `place`, through the same log and catch-up, so they work offline and sending twice does no harm. A place says "this name goes straight after that one, or at the start", and the server keeps each Shop's order as a list of matched item names, at most 500. Names, not item ids, as items come and go between trips. The catch-up returns the Shops changed after N alongside the items.
- **Web PubSub only says "something changed"**, never the change itself, so a missed message costs nothing: the next catch-up gets it.

One change, start to finish:

1. A phone sends "ticked off milk" to the API.
2. The API saves it in Cosmos DB, then tells Web PubSub the Shopping list changed.
3. Web PubSub tells the Hub and any phones with the app open.
4. Each asks the API for everything after the last change it has, and shows it.

The Hub holds one connection open to Web PubSub, an always-on service of its own. It doesn't ask the API over and over. Connecting to Web PubSub needs a URL with an access token from the API (`GET /live`). Tokens last 60 minutes, for the Hub as for phones (decided 22 November 2026), and a client asks for a new URL whenever it reconnects. Microsoft's docs suggest a token is only checked when connecting, so an open connection outlives it, but that's untested: two tries from a PC on 22 November 2026 stayed open for at least 45 minutes, then the PC slept and dropped them. It doesn't change the design, as phones sleep and networks drop, so every client reconnects anyway. The Hub, always on, tests it in slice 4. One hub carries every list's messages to every connection, and clients ignore the lists they don't show. There's no guard on the free tier's limits, as Free_F1 refuses rather than charges.

## Responsiveness

- **Taps are instant everywhere.** Ticking off, adding or removing changes the device's own copy straight away, and the change goes to the server in the background.
- **The API scales to zero after a quiet spell.** Flex then starts it again on the next request. Microsoft doesn't say how long it waits before scaling to zero, or publish how long a cold start takes, so measure both in slice 1. A cold start delays only how soon other devices see a change, never the tap itself.
- **The Hub still catches up every 10 to 15 minutes** in waking hours. That's the safety net for a missed "something changed" message. It may also keep the API warm, but nothing relies on it.
- **If cold starts prove annoying,** one always-ready instance removes them. Its memory is billed even when idle, with no free grant, so it needs its own approval.
- **A bug that loops costs money, not the API.** With no daily stop, the guards are the one-instance limit, the budget alert and Application Insights. Phones and the Hub carry on offline if the API is ever down.
- **The instance takes 16 requests at once** (found 17 November 2026). Flex's default for Python is 1, and with at most one instance, requests waited up to a minute or failed with a 503 after 60 seconds, even sent one at a time. With 16, a warm request takes about 0.1 seconds.
- **Cosmos DB and Web PubSub are always on.**

## Regulars

The usual Shopping items, offered to add in a few taps (Feature #15). The backend works them out each time they're asked for, with `GET /lists/shopping/regulars?limit=N` (at most 50), from the Shopping list's log. That's one query in the list's partition, and no scores are stored (#109).

- **What counts:** each Shopping item from the last 12 weeks counts once, dated by when it was ticked off, or by when it was added if it never was. Removed items don't count, as they were added by mistake.
- **The ranking:** items are matched by name the way Shops' walking orders are ("Milk", " milk" and "Milk." are one; "apple" and "apples" are two). A purchase counts half as much every 3 weeks, so something bought weekly beats something bought often two months ago. Each regular is shown as it was last spelled.
- **Left out:** names on the list and not ticked off, names ticked off in the last 10 minutes, and names marked Don't suggest.
- **Don't suggest** is a `dont_suggest` operation (an operation id and the name) sent like the others, so it works offline and sending it twice does no harm. It's for the whole Household. Adding a matching name again later undoes it.

The Hub shows up to 24 and a phone 20. The panels are their own stories (#110 and #111).

## Repeats

The server owns repeating To-dos, as calendar-style rules (RFC 5545's RRULE, read with `python-dateutil`): every 2 weeks, the first Monday of the month, and so on. It also does what Google Tasks can't:

- show a repeating To-do ahead of time,
- create repeating To-dos at the Hub or on a phone,
- "after it was last done" repeats, if they're ever wanted (the To-dos notes said none were needed with Tasks).

Ticking off or removing affects one occurrence, as now.

## The Pi

- **The Hub keeps its own copy** in SQLite ([ADR 0006](../../docs/adr/0006-hub-owned-data-in-sqlite.md)), so the wall still shows and changes the lists when the internet's down, and catches up when it's back.
- **It still only makes outbound connections.** Nothing is opened on the router, so ADR 0002's "nothing is reachable from the internet" still holds for the Pi. ADR 0002's "no cloud server" doesn't, and the new ADR replaces that part.
- **The Hub has an identity of its own** (decided 16 November 2026): an Entra app registration with a certificate, which the setup scripts copy to the Pi from the Key Vault, allowed only what the wall does: read and change the lists. This replaces the requirement that the Pi holds no Azure credentials besides the Application Insights connection string. A lost Pi means removing that certificate in Entra.

## Slices

1. **Backend skeleton:** Bicep for the Flex Consumption function app and its storage account, Cosmos DB, Web PubSub and the budget; a FastAPI service with `/health` behind `AsgiFunctionApp`, deployed by the pipeline; telemetry; sign-in with Entra External ID and Google. Measure the scale-to-zero wait and the cold start. Started: the function app, its storage account, the budget, `/health`, the deploy, Cosmos DB, Web PubSub and sign-in are in. Sign-in's setup by hand is in the [sign-in runbook](../../docs/runbooks/sign-in-setup.md), and the API checks it with `GET /me`. Not done yet: the measurements.
2. **The Shopping list in the backend:** its operations, log and live updates, with Python tests. Test data only. Built: the operations, log and catch-up (`POST /lists/shopping/operations` and `GET /lists/shopping/items`, in the [backend README](../../backend/README.md#the-shopping-list)), and live updates (`GET /live`, in the [backend README](../../backend/README.md#live-updates)).
3. **The family app, first version:** Static Web Apps in Bicep, and the app deployed to it by the pipeline; install, sign in, the Shopping list, offline queue, live updates. Static Web Apps waits until here (decided 17 November 2026), as there's nothing to host on it before the app. Started: the app installs on a phone from Static Web Apps, signs in with Google, and shows the Shopping list ([`family-app/`](../../family-app/README.md)), newest first by the number each item was added at (`added_seq`, AB#57). It works with no signal, from a copy of the list in IndexedDB that it opens from every time (AB#58), and shows changes made elsewhere live, through Web PubSub, while it's open and in front, closing the connection when it's put away (AB#59). It sorts the list for the shop a Member is in, each Shop learning its walking order from items dragged into place (AB#84, AB#86).
4. **The Hub on the backend:** a Shopping list client behind the same interface as the Google Tasks one, so the Shopping Section and Today card don't change.
5. **The switch:** the Hub uses the backend's Shopping list (AB#103, 27 November 2026). Nothing was imported, as the Google Tasks list was empty, and the Google Tasks list is left as it was. The Hub moved in one go, and `SHOPPING_SOURCE` went.
6. **To-dos and repeats**, in the backend, the app and the Hub, with an import from Tasks. Started: the backend keeps one-off To-dos, each with its text and a due date or none, in the `todos` partition of the lists container, with operations, the log, catch-up and live updates like Shopping (`POST /lists/todos/operations` and `GET /lists/todos/items`, in the [backend README](../../backend/README.md#to-dos), AB#118). Still to come: repeats (AB#119), the family app (AB#120), the Hub's switch with the import (AB#121), and editing and repeating at the Hub (AB#122).
7. **Notifications**, once it's clear what's worth a buzz.

Later, if wanted: Chores on the children's phones, the Week view on phones, and Energy away from home.

## Open questions

- **Do the children's Google accounts allow "Sign in with Google" to other apps?** If they're supervised with Family Link, a parent may have to allow it in Family Link first. Check with one child's account (AB#7). Sign-in was built without waiting (21 November 2026): the children's accounts are added to the list once it's known.
- **What's worth a notification?** For example, a To-do due today, or "something was added to the Shopping list".
- **Does the app share code with the Hub** as a package in this repo, or start as its own SvelteKit project and share later?

## Considered Options

- **Keep Google Tasks, with the Household's account on every phone:** no work, but the lists stay the Household account's rather than each Member's, and repeats stay hidden.
- **Microsoft To Do or Todoist:** shared lists across personal accounts and a ready-made app, but a third party's app, model and limits.
- **Lists the Hub owns on the Pi, with a phone web app:** no cloud, but phones away from home would need to reach the Pi (Tailscale or Cloudflare Tunnel).
- **A React Native (Expo) app:** a store-style app, installed from an APK or Google Play. An installable web app needs neither, updates itself, and shares the Hub's SvelteKit code.
- **Azure SQL Database:** the same engine as at work. Its free offer gives each database 100,000 vCore-seconds, 32 GB of data and 32 GB of backups a month, for the subscription's lifetime. Serverless runs at least 0.5 vCores while awake, so that's about 55 hours awake a month, and it stays awake at least 15 minutes after each use (60 by default). A family waking it several times a day could use that up within a month, and then it pauses until the 1st unless charges are allowed. The Basic tier (5 DTU, 2 GB) is always on, for about $5 a month.
- **Azure Database for PostgreSQL:** free only with a new Azure free account, for 12 months: 750 hours a month of the Burstable B1MS server and 32 GB. After that it's billed by the hour, the most of any option here.
- **Postgres outside Azure (Neon, Supabase):** free tiers, but the data would leave Azure and the Bicep setup.
- **A TypeScript backend:** would share merge and repeat rules with the Hub and the app. Python was chosen.
- **Azure Container Apps:** containers, scaling to zero, with an SLA, and closer to how a real product would run. Its free grant each month (180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests) is about 200 hours of the smallest copy (0.25 vCPU, 0.5 GiB), because it counts every second a copy runs. So it's free only if it scales to zero, and then a change waits a few seconds for it to start after a quiet spell. Kept running in waking hours it's roughly $2 to $3.50 a month, or $4 to $6.50 always on (sources disagree on the idle vCPU rate, $0.000003 or $0.000008 a second; memory is $0.000003 a GiB-second). Moving the FastAPI service there later is mostly a Bicep change.
- **App Service's Free plan (F1), kept warm by the Hub:** chosen first, on 16 November 2026. Free, and F1 counts CPU time, not time running. But it stops for the rest of the day after 60 CPU minutes, has no SLA, and isn't supported for production. Replaced by Flex Consumption ([ADR 0011](../../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)).
- **Azure Functions' Linux Consumption plan:** a similar free grant, but it retires on 30 September 2028.
- **Saves through Service Bus Standard, with sessions for ordering:** about $10 a month, which the family's load doesn't justify.
- **Notification Hubs for notifications:** needed for a store app's push, but Web Push reaches an installed web app with nothing extra.

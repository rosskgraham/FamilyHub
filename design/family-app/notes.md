# The family app and its backend: design notes

A proposal, started 16 November 2026, to move the Shopping list and To-dos off Google Tasks into a backend of the Hub's own in Azure, with an installable web app for the Household's phones beside it. Nothing here is built yet. When the open questions are settled, the decisions become an ADR.

## The idea

Today the Shopping list and To-dos are Google Tasks lists in the Household's one Google account ([ADR 0003](../../docs/adr/0003-shopping-list-in-google-tasks.md), [To-dos notes](../mockups/todos/notes.md)). Google Tasks lists can't be shared between personal Google accounts, so every phone has to be signed in to the Household's account to use them. The Tasks API also hides repeats: it can't create a repeating To-do, and can't show one before it's due.

Instead, the lists live in a backend in Azure. Each Member signs in to the family app on their own phone, as themselves. The Hub is one more client of the backend. Phones and the Hub each keep a copy, so the Shopping list still works in a shop with no signal, and the Hub still works when the internet's down.

This is the interesting path on purpose. Simpler ones are listed under Considered Options.

## Decided

- **Android only** (16 November 2026). Everyone in the Household has an Android phone.
- **The family app is an installable web app** (16 November 2026), not a store app: open its address in Chrome and tap Install. No Google Play, no APKs. It updates itself.
- **It's built with SvelteKit**, like the Hub, so it can share the Hub's components, colours and fonts.
- **The backend is Python** (16 November 2026).
- **Data is in Cosmos DB, on its free tier** (16 November 2026). Azure SQL's free offer and Azure's Postgres don't fit a free tier (see Considered Options).
- **Every Member gets an account, the children included** (16 November 2026). The children have Google accounts on devices of their own, so everyone signs in as themselves.
- **Children can do everything grown-ups can** on the Shopping list and To-dos (16 November 2026).
- **Only the Household's accounts get in.** The backend keeps a list of which Google account is which Member, kept out of the public repo like `household.json` (in the Key Vault). Any other account that signs in is turned away.
- **The app is at Static Web Apps' free `*.azurestaticapps.net` address** (16 November 2026), not a domain of the Household's own. Azure picks the name when the app is created, and it changes if the app is ever deleted and made again, which means installing it again on each phone.
- **The server decides.** As the backend is Python and the clients are TypeScript, merge rules and repeats live only on the server, so nothing is written twice. Clients queue changes, send them when they can, and show what the server says. That's how the Hub's Tasks queue already works (`app/src/lib/server/tasks/queue.ts`).

## Proposed architecture

```
 Phones (installed web app)          Azure (Bicep, ADR 0008)                     Pi (the Hub)
 ┌──────────────────┐   HTTPS +    ┌──────────────────────────────┐  outbound   ┌──────────────────┐
 │ IndexedDB copy,  │◄──realtime──►│ API on Container Apps        │◄──only────► │ SQLite copy      │
 │ service worker:  │              │ (Python, scales to zero)     │             │ keeps working    │
 │ opens and works  │              │ Cosmos DB free tier          │             │ when internet's  │
 │ offline in the   │              │ Web PubSub (live updates)    │             │ down; still no   │
 │ shop             │◄──Web Push───│ Entra External ID (sign-in)  │             │ open port        │
 └──────────────────┘              │ Static Web Apps (the app)    │             └──────────────────┘
                                   └──────────────────────────────┘
```

| Part | Proposal | Free allowance (to check against current pricing) |
|---|---|---|
| The app's files | Azure Static Web Apps, free tier, with free HTTPS, which installable web apps need | Free tier |
| API | Python, FastAPI and Pydantic, in a container on Azure Container Apps, scaling to zero | Monthly free grant of vCPU-seconds, memory and requests |
| Container images | GitHub Container Registry, as the repo is public | Free for public images. Azure Container Registry has no free tier |
| Data | Cosmos DB for NoSQL, free tier, read with `azure-cosmos` | 1000 RU/s and 25 GB, one free account per subscription, for good |
| Live updates | Azure Web PubSub, free tier: the server tells clients something changed, and they fetch it | Free tier caps connections and messages a day, enough for a family |
| Notifications | Web Push, sent by the API with `pywebpush` | Free: no Firebase or Notification Hubs |
| Sign-in | Microsoft Entra External ID, with Google as the way in, so each Member uses their own Google account. MSAL in the app | Free up to a monthly number of users |
| Telemetry | Application Insights, as the Hub already uses ([ADR 0005](../../docs/adr/0005-telemetry-via-otel-collector-to-app-insights.md)) | Inside the existing daily cap |
| Infrastructure | Bicep in `infra/`, deployed by the Azure DevOps pipeline ([ADR 0008](../../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)) | — |

Every part stays on a free tier, as ADR 0008 requires. The API and the database sign in to each other with the container's managed identity, so there's no password anywhere.

## The family app

- **Installing:** open its address in Chrome on the phone and tap Install. It gets an icon on the home screen and opens full-screen.
- **Offline:** a service worker keeps the app itself on the phone, so it opens with no signal. The lists are in IndexedDB, and changes wait in a queue until the phone's back online.
- **Updates:** a new release reaches each phone the next time the app opens.
- **Its address is public**, at `*.azurestaticapps.net`. Only the app's files are public. The lists are behind sign-in, in the API.
- **Sign-in happens in the app**, with MSAL against Entra External ID. Static Web Apps' own sign-in on the free tier doesn't offer Google.

## How sync works

- **Every change is an operation** with an ID made on the device: add an item, tick it off, untick it, rename it, remove it. The device keeps it in a queue until the server confirms it, so sending it twice does no harm.
- **The server applies operations in the order it receives them**, and keeps them in Cosmos DB with a sequence number. A client asks for "everything after number N", so catching up after a day offline is one request.
- **Cosmos DB's change feed** gives every change as an ordered stream. It drives the "something changed" messages through Web PubSub.
- **Conflicts are settled per field**, latest write wins, with two rules where that's wrong. Removing beats editing: an item removed at home doesn't come back because someone ticked it in the shop. And ticking off is kept apart from the item's text.
- **Web PubSub only says "something changed"**, never the change itself, so a missed message costs nothing: the next catch-up gets it.

## Responsiveness

- **Taps are instant everywhere.** Ticking off, adding or removing changes the device's own copy straight away, and the change goes to the server in the background.
- **The API scales to zero.** After about 5 minutes with no requests, Container Apps stops it. The next request waits for a container and Python to start: typically a few seconds, more for a large image. So after a quiet spell, a change can take several seconds to reach the other devices, instead of about one. Cosmos DB and Web PubSub are always on.
- **The Hub doesn't poll often**, or the API would never scale to zero. It relies on live updates, and catches up now and then.
- **The image is kept small**, and the app starts quickly, so cold starts stay short. Application Insights measures them.
- **If the delay is annoying in practice**, a schedule can keep one copy of the API running in waking hours (about 06:30 to 22:00, matching the Hub's Sleep). That's one Bicep setting, and costs a little beyond the free grant, roughly £2 a month, so it needs Ross's approval.

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

1. **Backend skeleton:** Bicep for Container Apps, Cosmos DB, Web PubSub and Static Web Apps; a FastAPI service with `/health`; images built in GitHub Actions; telemetry; sign-in with Entra External ID and Google.
2. **The Shopping list in the backend:** its operations, log, change feed and live updates, with Python tests. Test data only.
3. **The family app, first version:** install, sign in, the Shopping list, offline queue, live updates.
4. **The Hub on the backend:** a Shopping list client behind the same interface as the Google Tasks one, so the Shopping Section and Today card don't change.
5. **The switch:** import the Household's list from Google Tasks once, then use the backend.
6. **To-dos and repeats**, in the backend, the app and the Hub, with an import from Tasks.
7. **Notifications**, once it's clear what's worth a buzz.

Later, if wanted: Chores on the children's phones, the Week view on phones, and Energy away from home.

## Open questions

- **Do the children's Google accounts allow "Sign in with Google" to other apps?** If they're supervised with Family Link, a parent may have to allow it in Family Link first. Check with one child's account before building sign-in.
- **What's worth a notification?** For example, a To-do due today, or "something was added to the Shopping list".
- **Backups:** Cosmos DB's built-in periodic backup, or a nightly export to Google Drive like Chores (ADR 0006).
- **What happens to the Google Tasks lists** after the switch: deleted, or left as a read-only record.
- **Does the Hub's own Shopping and To-dos code move to the backend client in one go**, or stay switchable between Google Tasks and the backend for a while?
- **Does the app share code with the Hub** as a package in this repo, or start as its own SvelteKit project and share later?

## Considered Options

- **Keep Google Tasks, with the Household's account on every phone:** no work, but the lists stay the Household account's rather than each Member's, and repeats stay hidden.
- **Microsoft To Do or Todoist:** shared lists across personal accounts and a ready-made app, but a third party's app, model and limits.
- **Lists the Hub owns on the Pi, with a phone web app:** no cloud, but phones away from home would need to reach the Pi (Tailscale or Cloudflare Tunnel).
- **A React Native (Expo) app:** a store-style app, installed from an APK or Google Play. An installable web app needs neither, updates itself, and shares the Hub's SvelteKit code.
- **Azure SQL Database:** the same engine as at work. Its free serverless offer gives about 55 hours awake a month at its smallest size, which a family waking it several times a day could use up within a month, and it takes up to about a minute to wake. The Basic tier is always on but costs roughly £4 a month.
- **Azure Database for PostgreSQL:** free only for a new Azure account's first 12 months, then roughly £10 to £12 a month.
- **Postgres outside Azure (Neon, Supabase):** free tiers, but the data would leave Azure and the Bicep setup.
- **A TypeScript backend:** would share merge and repeat rules with the Hub and the app. Python was chosen.
- **Azure Functions instead of Container Apps:** also scales to zero, but a long-lived FastAPI service is easier to run and test locally the same way it runs in Azure.
- **Notification Hubs for notifications:** needed for a store app's push, but Web Push reaches an installed web app with nothing extra.

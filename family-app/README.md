# The family app

The Household's app for phones ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): an installable web app, built with SvelteKit like the Hub, served by Azure Static Web Apps' free plan. Open its address in Chrome on an Android phone and tap **Install**. The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it installs on a phone, signs in, and shows the Shopping list, which keeps working with no signal (slice 3's first four stories). Live updates come next.

## Signing in

Each Member signs in with their own Google account, through the FamilyHub tenant in Entra External ID ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md), the [sign-in runbook](../docs/runbooks/sign-in-setup.md)). `src/lib/auth.ts` wraps MSAL:

- **Sign in with Google** is a full-page redirect to the tenant, asking which Google account every time, and back to `/`. An installed app handles a redirect better than a popup.
- Tokens are kept in the phone's local storage, so the app stays signed in between openings. A single-page app's refresh token lasts 24 hours. After that, MSAL renews through the tenant's session in a hidden frame that lands on `/auth/bridge` (MSAL v5's redirect bridge), or the app asks to sign in again. How often that happens is measured in AB#56.
- The app then asks the backend's `GET /me` who it is (`src/lib/session.ts`): one of the Household gets the Shopping list, with the circle and their initial at the top, whose menu has **Sign out** (`design/mockups/family-app/`, screen I); anyone else gets "Not this account" (screen B), with **Use another account**, which signs out and goes straight on to choosing an account.
- A sign-in that comes back with an error, as when it's cancelled at the account choice, says signing in didn't finish, with **Sign in again**.

## The Shopping list

Screens C, D, E and H in `design/mockups/family-app/`, through the backend's list API ([backend README](../backend/README.md#the-shopping-list)). `src/lib/shopping.svelte.ts` holds the list; `src/lib/Shopping.svelte` shows it.

- **Items to get, newest first, then those ticked off in the last 10 minutes,** struck through, as on the Hub. The order is the backend's `added_seq`, so ticking or changing an item doesn't move it. A ticked item drops off the phone once its 10 minutes are up.
- **Tap the box to tick or untick. Tap the words to change or remove the item,** in a sheet from the bottom. The add box at the bottom stays open after adding.
- **Every tap shows straight away.** Each change is an operation, with its id and a new item's id made on the phone, queued and sent in the background. The phone shows the backend's items with its own unsent changes replayed on top; the backend decides how changes merge.
- **A failed send is tried again,** after 1 second, then twice as long each time up to a minute, and whenever the app comes back to the front or the phone comes back online. Sending an operation again is safe: the backend applies it once.
- **Removing shows Undo for 5 seconds.** The remove waits on the phone until then, or is sent at once if the app is put away, so Undo needs nothing from the backend, which never brings a removed item back.
- **Changes made elsewhere show** after each send and whenever the app comes back to the front, by asking the backend for everything after the last number it gave. Live updates come in AB#59.

## With no signal

Shops often have no signal, so the phone keeps its own copy of the list (AB#58, screens F and G).

- **The copy is in IndexedDB** (`src/lib/copy.ts`): the items the phone knows, the backend's last number, the changes it hasn't sent, and who's signed in. Every change is saved before it's sent, so closing the app loses nothing.
- **The app opens from the copy straight away,** every time there's one for the account that's signed in, then gets a token, checks `GET /me`, catches up and sends what's waiting, in the background (`src/lib/session.ts`). With no copy yet, it loads from the backend.
- **While the backend can't be reached,** a banner says "No signal" and how many changes will send, and each item with a change waiting is marked "waiting". It keeps trying, on the same backoff, and when the phone comes back online.
- **When sign-in has run out** (the token can't be renewed quietly, or the backend says 401), the list stays usable, changes are kept, and a banner asks to sign in again. They send after signing in with the same account. A 403 from `GET /me` goes to "Not this account", and the copy goes.
- **The copy belongs to one account.** Signing in with a different one starts afresh, and **Sign out clears it**, so the next person to use the phone doesn't see the list. If changes haven't sent yet, the circle's menu says how many, and signing out loses them.
- With no copy, as on a first sign-in, the app still needs the signal to open the list.

The settings are built in by the pipeline, from the `familyhub` variable group and the Bicep's outputs. None is secret. Without them, the app says sign-in isn't set up. To sign in on the PC, put them in `family-app/.env`, which Git ignores:

```
VITE_FAMILYHUB_ENTRA_TENANT_ID=<the tenant's ID>
VITE_FAMILYHUB_ENTRA_SUBDOMAIN=<its subdomain>
VITE_FAMILYHUB_APP_CLIENT_ID=<FamilyHub app's client ID>
VITE_FAMILYHUB_API_CLIENT_ID=<FamilyHub API's client ID>
VITE_FAMILYHUB_API_URL=https://func-familyhub-<suffix>.azurewebsites.net
```

The backend lets the app call it from `http://localhost:5173` as well as its own address (CORS).

## What's here

- `src/`: the app. `src/routes/+page.svelte` decides which screen to show; the screens and the sign-in code are in `src/lib/`. It's a single-page app with no server (`ssr = false`): Static Web Apps serves the same `index.html` for every path that isn't a file, as `static/staticwebapp.config.json` says.
- `src/service-worker/`: keeps the app's own files on the phone, so it opens in a shop with no signal. Each release gets a new cache, which reaches a phone the next time the app opens. Calls to the backend aren't touched.
- `static/manifest.webmanifest`: what Chrome needs to install it: the name, the icons and full-screen display.
- `static/icons/`: the home-screen icons, made from `static/logo.svg` (a copy of `site/logo.svg`) by `npm run icons`. Run it again after changing the logo, and commit the results.
- The colours are the Hub's (`app/src/lib/theme.ts`): its Day theme when the phone is set to light, its Evening theme when dark. They're copied rather than shared, until there's enough in common to share (decided 22 November 2026).

## Run it on the PC

You need Node 24, as CI uses.

```
cd family-app
npm install
npm run dev
```

Then open <http://localhost:5173>. The service worker only runs in a build: `npm run build`, then `npm run preview`.

## Checks

`npm run check` (types), `npm run lint` (Prettier and ESLint), `npm test` (Vitest) and `npm run build`. GitHub Actions CI runs all four in its `family-app` job.

## Deploying

A merge to `main` that touches `family-app/` or `infra/` runs the Azure DevOps pipeline ([`infra/azure-pipelines.yml`](../infra/azure-pipelines.yml)). Its Check stage tests and builds the app. Its Deploy stage deploys the Bicep, which makes the Static Web Apps resource, then builds the app with its settings (the API's address comes from the Bicep), reads the resource's deployment token, and uploads the build with the Static Web Apps CLI. The token is used straight away and never stored. The app's address is the Bicep's `familyAppUrl` output, at `*.azurestaticapps.net`.

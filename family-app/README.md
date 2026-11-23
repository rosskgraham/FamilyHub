# The family app

The Household's app for phones ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): an installable web app, built with SvelteKit like the Hub, served by Azure Static Web Apps' free plan. Open its address in Chrome on an Android phone and tap **Install**. The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it installs on a phone, opens with no signal, and signs in (slice 3's first two stories). The Shopping list, working offline and live updates come next.

## Signing in

Each Member signs in with their own Google account, through the FamilyHub tenant in Entra External ID ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md), the [sign-in runbook](../docs/runbooks/sign-in-setup.md)). `src/lib/auth.ts` wraps MSAL:

- **Sign in with Google** is a full-page redirect to the tenant, asking which Google account every time, and back to `/`. An installed app handles a redirect better than a popup.
- Tokens are kept in the phone's local storage, so the app stays signed in between openings. A single-page app's refresh token lasts 24 hours. After that, MSAL renews through the tenant's session in a hidden frame that lands on `/auth/bridge` (MSAL v5's redirect bridge), or the app asks to sign in again. How often that happens is measured in AB#56.
- The app then asks the backend's `GET /me` who it is (`src/lib/session.ts`): one of the Household shows their first name and the circle, whose menu has **Sign out**; anyone else gets "Not this account", with **Use another account** (`design/mockups/family-app/`, screens A and B).

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

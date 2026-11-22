# The family app

The Household's app for phones ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)): an installable web app, built with SvelteKit like the Hub, served by Azure Static Web Apps' free plan. Open its address in Chrome on an Android phone and tap **Install**. The plan and its slices are in the [design notes](../design/family-app/notes.md).

So far it's slice 3's first story: a holding page that installs on a phone and opens with no signal. Sign-in, the Shopping list, working offline and live updates come next.

## What's here

- `src/`: the app. It's a single-page app with no server (`ssr = false`): Static Web Apps serves the same `index.html` for every path that isn't a file, as `static/staticwebapp.config.json` says.
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

A merge to `main` that touches `family-app/` or `infra/` runs the Azure DevOps pipeline ([`infra/azure-pipelines.yml`](../infra/azure-pipelines.yml)). Its Check stage tests and builds the app. Its Deploy stage deploys the Bicep, which makes the Static Web Apps resource, then reads the resource's deployment token and uploads the build with the Static Web Apps CLI. The token is used straight away and never stored. The app's address is the Bicep's `familyAppUrl` output, at `*.azurestaticapps.net`.

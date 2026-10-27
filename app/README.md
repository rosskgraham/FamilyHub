# FamilyHub app

The Hub's screen and the small server behind it, in SvelteKit.

## Run it on your PC

```
cd app
npm install
npm run dev
```

Then open <http://localhost:5173>. The screen is designed at 1920×1080 and scales to fit the window.

- `/` is the Today view.
- `/week` is the Week view. `?week=1` shows next week, and `?week=-1` last week.

Until it's set up, it shows sample Events (a typical week repeated for every week) and a sample Shopping list kept in memory, which resets when the app restarts. The weather is always a sample for now.

## Show the real Calendars and Shopping list

1. Follow [the Google Cloud runbook](../docs/runbooks/google-cloud-setup.md), and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `app/.env`.
2. Run the app, and choose **Sample data · set up Google** in the bottom corner (or go to <http://localhost:5173/setup>).
3. Sign in with the Household's Google account, then choose whose each Calendar is and which Google Tasks list is the Shopping list.

The corner then shows when the Calendars last updated. It warns if the Hub is offline or Google needs it to sign in again (weekly while the Google app is in Testing).

The sign-in and the Calendar choices are kept in `app/data/`, which Git ignores. Delete that folder to start again. Set `CALENDAR_SOURCE=sample` in `app/.env` to show sample Events even when Google is set up.

## Check types

```
npm run check
```

## Layout

- `src/lib/time.ts`: UK time handling. Everything is shown in Europe/London time, whatever the machine's own time zone.
- `src/lib/household.ts`: Members and their colours.
- `src/lib/calendar.ts`: the Event type and grouping Events by day.
- `src/lib/server/calendar/`: where Events come from. `google.ts` reads Google Calendar, `fake.ts` is the sample week, and `index.ts` picks one and keeps the last good result for when Google can't be reached.
- `src/lib/server/google/auth.ts`: signing in to Google and keeping the sign-in fresh.
- `src/routes/setup/`: signing in, choosing whose each Calendar is, and choosing the Shopping list.
- `src/lib/server/shopping/`: where the Shopping list comes from. `google.ts` reads and changes Google Tasks, `fake.ts` is the sample list.
- `src/lib/components/ShoppingList.svelte`: the list on the Today view and in the Shopping section, with ticking off, adding and removing.
- `src/routes/api/shopping/`: the endpoint the screen calls to change the list.
- `src/env.ts`: the environment variables the app reads.
- `src/routes/`: the Today view (`+page.svelte`) and Week view (`week/`).

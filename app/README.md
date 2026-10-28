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

Until it's set up, it shows sample Events (a typical week repeated for every week) and a sample Shopping list kept in memory, which resets when the app restarts. The weather is a sample until home is set.

## Show the real Calendars and Shopping list

1. Follow [the Google Cloud runbook](../docs/runbooks/google-cloud-setup.md), and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `app/.env`.
2. Copy `app/household.example.json` to `app/household.json` and put in the Household's Members, each with a name and a colour (`blue`, `orange`, `green` or `purple`). An `initial` is optional; it's the first letter of the name otherwise. Git ignores this file. Everyone, for the Family calendar, is always there.
3. Run the app, and choose **Sample data · set up Google** in the bottom corner (or go to <http://localhost:5173/setup>).
4. Sign in with the Household's Google account, then choose each Member's Calendar and which Google Tasks list is the Shopping list.

To change a Calendar later, go back to <http://localhost:5173/setup>. Changes to `household.json` show on the next reload. Renaming a Member means choosing their Calendar again. Sample Events always use the made-up Household (Alex, Sam, Maya and Leo).

The corner then shows when the Calendars last updated. It warns if the Hub is offline or Google needs it to sign in again (weekly while the Google app is in Testing).

The sign-in and the Calendar choices are kept in `app/data/`, which Git ignores. Delete that folder to start again. Set `CALENDAR_SOURCE=sample` in `app/.env` to show sample Events, a sample Shopping list and sample weather even when Google and home are set up.

## Show the real weather

Put home's latitude and longitude in `app/.env`, for example `HOME_LATITUDE=51.50` and `HOME_LONGITUDE=-0.12`. Two decimal places is close enough. The header then shows the current weather from [Open-Meteo](https://open-meteo.com/), which needs no key, and the highest chance of rain in the next three hours. It asks again every 10 minutes. If Open-Meteo can't be reached, the header keeps the last forecast for up to three hours, then hides the weather rather than show a stale forecast.

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

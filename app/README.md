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
- `?theme=evening` or `?theme=day` on any page shows that theme whatever the time. Otherwise the Day theme shows from sunrise to sunset and the Evening theme after.

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

Put home's latitude and longitude in `app/.env`, for example `HOME_LATITUDE=51.50` and `HOME_LONGITUDE=-0.12`. Two decimal places is close enough. The header then shows the current weather from [Open-Meteo](https://open-meteo.com/), which needs no key, and the highest chance of rain in the next three hours. It asks again every 10 minutes, and takes today's sunrise and sunset from the same forecast to switch between the Day and Evening themes. Until it has them, or with sample weather, it uses 07:05 and 16:40. If Open-Meteo can't be reached, the header keeps the last forecast for up to three hours, then hides the weather rather than show a stale forecast.

## Set up the real Chores

Copy `app/chores.example.json` to `app/chores.json`, which Git ignores, and put in the Household's Routines and Chores:

- Each **Routine** has an `id`, a `name` and a `from` time, in the order they happen. The current one is marked "Now".
- Each **Chore** has an `id`, a `name`, an `icon` (`teeth`, `bed`, `shirt`, `home`, `music`, `book` or `bin`), `stars` from 1 to 3, the `routines` it's done in, and `who` does it, by their names in `household.json` (capitals don't matter). Add `days`, such as `["Wed"]`, for a Chore that isn't every day.
- **Bonus jobs**, under `bonus`, are optional extras shown as **Up for grabs**. Each has an `id`, a `name`, `stars` from 1 to 3 and optional `days`. Any child can do one: they tap **Done it**, then their own badge, and the Stars go to them. Each job can be done once a day, by whoever's first; tapping it again offers **Undo**.
- History is recorded against the ids, so a `name` can change freely, but changing an `id` starts its history afresh. Bonus jobs and Chores can't share an id.

Changes show on the next reload. Ticks are kept in `app/data/hub.db`, a SQLite database ([ADR 0006](../docs/adr/0006-hub-owned-data-in-sqlite.md)). Without `chores.json`, or with `CALENDAR_SOURCE=sample`, the Chores section shows sample Chores for Maya and Leo with a made-up week, kept in memory, which resets when the app restarts.

## Check types and run the tests

```
npm run check
npm test
```

`npm run test:watch` reruns the tests as files change. Unit tests sit next to the code they test, as `*.test.ts`.

## Screenshot tests

Playwright takes a screenshot of each view, in the Day theme and the Evening theme, and compares it with the one in `app/e2e/__screenshots__/`. It uses sample data and pretends it's 08:15 on Wednesday 28 October 2026, whatever is in `app/.env`. Screenshots differ slightly between operating systems, so they're always taken in the Playwright Linux image, which needs Docker running:

```
npm run test:screenshots          # compare with the saved screenshots
npm run test:screenshots:update   # save new ones after a deliberate change
```

Commit updated screenshots with the change that caused them, so the pull request shows the before and after. If CI finds a difference, the run's **playwright-report** download shows it.

GitHub Actions runs the type check, the unit tests and the screenshot tests on every pull request, and `main` only accepts changes through a pull request that passes them.

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

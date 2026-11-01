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
- After two minutes without a touch, the Hub goes back to the Today view, except from the setup page.
- From 22:00 to 06:30 the Hub shows Sleep: a dim clock and the next Event. A tap wakes it, and it goes back to Sleep two minutes after the last touch. The schedule is `sleepSchedule` in `src/lib/sleep.ts`, so changing it is a pull request.

Until it's set up, it shows sample Events (a typical week repeated for every week) and a sample Shopping list kept in memory, which resets when the app restarts. The weather is a sample until home is set.

## Show the real Calendars and Shopping list

1. Follow [the Google Cloud runbook](../docs/runbooks/google-cloud-setup.md), and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `app/.env`.
2. Copy `app/household.example.json` to `app/household.json` and put in the Household's Members, each with a name and a colour (`blue`, `orange`, `green` or `purple`). An `initial` is optional; it's the first letter of the name otherwise. Git ignores this file. Everyone, for the Family calendar, is always there.
3. Run the app, and choose **Sample data · set up Google** in the bottom corner (or go to <http://localhost:5173/setup>).
4. Sign in with the Household's Google account, then choose each Member's Calendar and which Google Tasks list is the Shopping list.

To change a Calendar later, go back to <http://localhost:5173/setup>. Changes to `household.json` show on the next reload. Renaming a Member means choosing their Calendar again. Sample Events always use the made-up Household (Alex, Sam, Maya and Leo).

The corner then shows when the Calendars last updated. It warns if the Hub is offline or Google needs it to sign in again (weekly while the Google app is in Testing).

The sign-in and the Calendar choices are kept in `app/data/`, which Git ignores. Delete that folder to start again.

### When Google can't be reached

- The Hub shows the last Events and Shopping list it loaded, and the bottom bar says "Offline · last updated 14:02". They're kept in `app/data/` too, so they still show after a restart, and on a new day the Calendar is pieced together from the days it loaded before. To spare the Pi's SD card, they're written when they change and otherwise hourly.
- Shopping changes wait in `app/data/shopping-queue.json` and show on screen straight away, with "Offline · 2 to send" on the list. They're sent in order once Google answers. One Google turns down, such as ticking off an item someone deleted on their phone, is dropped.
- Google requests give up after 10 seconds, so a dead connection never holds up the screen. Set `CALENDAR_SOURCE=sample` in `app/.env` to show sample Events, a sample Shopping list and sample weather even when Google and home are set up.

## Show the real weather

Put home's latitude and longitude in `app/.env`, for example `HOME_LATITUDE=51.50` and `HOME_LONGITUDE=-0.12`. Two decimal places is close enough. The header then shows the current weather from [Open-Meteo](https://open-meteo.com/), which needs no key, and the highest chance of rain in the next three hours. It asks again every 10 minutes, and takes today's sunrise and sunset from the same forecast to switch between the Day and Evening themes. Until it has them, or with sample weather, it uses 07:05 and 16:40. If Open-Meteo can't be reached, the header keeps the last forecast for up to three hours, then hides the weather rather than show a stale forecast.

## Show the real energy prices

Put the Household's Octopus account number and API key in `app/.env`, as `OCTOPUS_ACCOUNT=A-1234ABCD` and `OCTOPUS_API_KEY=sk_live_…`. The key is on the Octopus account under Personal details, then API access. It can see the account and its bills, so keep it out of chats and commits.

The Energy section and the Today view's Energy card then show the account's Intelligent Octopus Go rates and Smart-charging slots, read from Octopus's GraphQL API ([ADR 0007](../docs/adr/0007-energy-from-octopus-rates-and-the-zappi.md)). The Hub asks for the rates once a day, so a renewal at new prices is picked up, and for slots every 10 minutes while the car is plugged in and hourly while it isn't. It keeps both in `app/data/energy-tariff.json` and `app/data/energy-slots.json`, so they still show after a restart without internet, with "Octopus unreachable · last updated 14:02". The Off-peak window, 23:30 to 05:30, is part of the tariff and written into `src/lib/energy.ts`, with the Hungry appliances and how long each runs. If the account moves to another tariff, the Section says so instead of guessing its times. If Octopus or myenergi has been failing for an hour, the Today view's Energy card says "ask Alex". `CALENDAR_SOURCE=sample` shows sample energy too.

## Show the real usage from the Zappi

Put the Zappi's serial number and the myenergi account's API key in `app/.env`, as `ZAPPI_GLO_SN=12345678` and `ZAPPI_GLO_API_KEY=…`. The serial is on the Zappi and in the myenergi app. The key comes from https://myaccount.myenergi.com, under Products, then Advanced, then Generate new API key. Like the Octopus key, it never goes in chats or commits.

The Energy section then shows the Zappi's Live demand and the Car's state, asked for about once a minute, and today's and yesterday's House use and Car charging, from its per-minute history every 15 minutes. myenergi's API is unofficial, so everything that talks to it is in `src/lib/server/energy/myenergi.ts`. The Hub adds the minutes up into Half-hours and keeps them in `app/data/energy.db`, a cache that can be fetched again, so it isn't backed up. If the Zappi stops answering for five minutes, the Section says "Car charger not reporting since 14:02" and still shows the prices.

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

Playwright takes a screenshot of each view, in the Day theme and the Evening theme, and of Sleep, and compares it with the one in `app/e2e/__screenshots__/`. It uses sample data and pretends it's 08:15 on Wednesday 28 October 2026, whatever is in `app/.env`. Screenshots differ slightly between operating systems, so they're always taken in the Playwright Linux image, which needs Docker running:

```
npm run test:screenshots          # compare with the saved screenshots
npm run test:screenshots:update   # save new ones after a deliberate change
```

Commit updated screenshots with the change that caused them, so the pull request shows the before and after. If CI finds a difference, the run's **playwright-report** download shows it.

GitHub Actions runs the type check, the unit tests and the screenshot tests on every pull request, and `main` only accepts changes through a pull request that passes them.

## Releases

Every merge to `main` that passes CI becomes a [GitHub release](https://github.com/rosskgraham/FamilyHub/releases), which the Pi will pull ([ADR 0004](../docs/adr/0004-pi-pulls-releases.md)). Versions are the UK date and CI's run number, such as `2026.10.31.57`, so they sort in the order they were made.

A release is `familyhub-<version>.tar.gz` and its SHA-256. It holds the built server and a `package.json`, and nothing else: the app has no runtime dependencies and no native code, so the same package runs on a PC and on the Pi. Before publishing, `scripts/release.mjs` unpacks it, starts it, and checks it answers with its version.

To run one, unpack it and start it with Node 24 from that folder. It reads `household.json`, `chores.json` and `data/` from the folder it runs in, and its settings from the environment:

```
node --env-file=.env build
```

It listens on port 3000, or `PORT`. `/api/health` answers `{"status":"ok","version":"2026.10.31.57"}`, which is what the Pi checks after switching to a new release.

## Layout

- `src/lib/time.ts`: UK time handling. Everything is shown in Europe/London time, whatever the machine's own time zone.
- `src/lib/household.ts`: Members and their colours.
- `src/lib/theme.ts`: the Day and Evening themes, and when each shows.
- `src/lib/sleep.ts`: the Sleep schedule, and whether the Hub is asleep. `src/lib/components/Sleep.svelte` is the Sleep screen.
- `src/lib/calendar.ts`: the Event type and grouping Events by day.
- `src/lib/server/calendar/`: where Events come from. `google.ts` reads Google Calendar, `fake.ts` is the sample week, `index.ts` picks one, and `cache.ts` keeps the last good Events for when Google can't be reached.
- `src/lib/server/google/auth.ts`: signing in to Google and keeping the sign-in fresh.
- `src/routes/setup/`: signing in, choosing whose each Calendar is, and choosing the Shopping list.
- `src/lib/server/shopping/`: where the Shopping list comes from. `google.ts` reads and changes Google Tasks, `fake.ts` is the sample list, and `queue.ts` holds changes made while Google can't be reached.
- `src/lib/components/ShoppingList.svelte`: the list on the Today view and in the Shopping section, with ticking off, adding and removing.
- `src/routes/api/shopping/`: the endpoint the screen calls to change the list.
- `src/env.ts`: the environment variables the app reads.
- `src/routes/`: the Today view (`+page.svelte`) and Week view (`week/`).

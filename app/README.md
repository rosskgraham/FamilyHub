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
- `/settings`, the gear at the end of the bottom bar, is Settings. It chooses a 24-hour clock (the default) or a 12-hour one, for every time on the screen, and holds the Household and Google (below). **About this Hub** shows the release running (or "Development build"), its commit, when it was built, when the server started, and Node.js's version. A change to `vite.config.ts` needs `npm run dev` started again before it shows.
- Any text box opens the Hub's own on-screen keyboard (ADR 0009), and the page slides up so the box stays above it. It has numbers along the top, `?123` for symbols including £, a capital at the start of a box, and hold-to-repeat on delete. Enter is labelled with the form's button, such as **Add**. It shows on the PC too, so typing on a real keyboard still works alongside it.
- Tapping an Event on any view shows its full title, whose it is, its day and its times. Tapping outside it, Close, or two minutes untouched closes it.
- `?theme=evening` or `?theme=day` on any page shows that theme whatever the time. Otherwise the Day theme shows from sunrise to sunset and the Evening theme after.
- On a touch-only screen, such as the Hub's, the mouse pointer is hidden. A PC with a mouse keeps it.
- After two minutes without a touch, the Hub goes back to the Today view, except partway through signing in to Google.
- From 22:00 to 06:30 the Hub shows Sleep: a dim clock and the next Event. A tap wakes it, and it goes back to Sleep two minutes after the last touch. The schedule is `sleepSchedule` in `src/lib/sleep.ts`, so changing it is a pull request.

Until it's set up, it shows sample Events (a typical week repeated for every week) and a sample Shopping list and sample To-dos kept in memory, which reset when the app restarts. The weather is a sample until home is set.

### Or on the Pi's screen

```
npm run pi:dev
```

This runs the same dev server and shows it on the Pi's screen, so a saved change appears on the wall straight away, with no release. It asks for `hubadmin`'s sudo password. Ctrl+C puts the Hub back on the screen, as does losing the connection or restarting the Pi. The Hub keeps running on the Pi throughout, so nothing on it changes. The screen shows the PC's data, not the Pi's, and dev mode loads slowly, so judge speed on a release.

It needs the Pi's SSH key in `C:\Users\<you>\.ssh` (copy it from Ubuntu if it was made there, as in [the Pi runbook](../docs/runbooks/pi-setup.md)). The Pi is `familyhub.local`, or `FAMILYHUB_PI_HOST` if that's set.

### Or a card's work, with the real setup

```
node scripts/card-dev.mjs
```

Run in a card's worktree, on its branch `ab<id>-…`, this starts its dev server at `http://localhost:<6000 + id>`, so a change can be seen and tried with the real Calendars, Nest and sign-ins while it's built ([how work is done](../docs/ways-of-working.md#seeing-it-while-its-built)). It takes the main checkout's `app/.env`, read each time it starts, and a copy of its `app/data`, so changes to the Hub's own databases, such as Stars and Settings, stay in the copy. Everything else it reaches is real: changing the heating there changes the Nest. `--fresh-data` copies the data again, and `--stop` stops it. The server runs on its own, logging to `data/dev-server.log`.

`node scripts/card-dev.mjs --main` moves the main checkout to the latest `origin/main` and restarts its dev server on 5173, so that always shows what's merged. It leaves the checkout alone if anything in it is changed or it's on a branch.

## Show the real Calendars and To-dos

1. Follow [the Google Cloud runbook](../docs/runbooks/google-cloud-setup.md), and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `app/.env`.
2. Run the app, and choose **Sample data · set up Google** in the bottom corner, or the gear. Under **Household and Google**, hold **Hold to change** for a second to unlock it.
3. Sign in with the Household's Google account.
4. Add each Member, with a name, a colour and their Calendar, and save the Family calendar's colour and Calendar. The colours include Google Calendar's own (Blueberry, Cherry Blossom, Peacock, Pistachio and Tangerine), to match everyone's phones. The Family calendar can't share a Member's colour.
5. Choose the Birthdays calendar, and which Google Tasks list is the To-dos. The Shopping list comes from the family app's backend instead ([below](#the-shopping-list)). Repeating To-dos are set up in the Google Tasks app on a phone; the Hub only adds one-off ones.

Change any of it later in the same place. Each Member has an id that never changes, so renaming someone keeps their Calendar and Stars. A Member with Chores can't be removed. Until a Member is added, the Hub shows the made-up Household (Ross, Sam, Maya and Leo).

The Household and every choice in Settings are kept in `app/data/hub.db`, the Hub's database, with the Chores ([ADR 0012](../docs/adr/0012-household-and-settings-in-the-hub-database.md)). On first start, the Hub imports `app/household.json`, `app/chores.json` and `app/data/settings.json` from before, if they're there, keeping the ids they gave. After that they're ignored and can be deleted.

The corner then shows when the Calendars last updated. It warns if the Hub is offline or Google needs it to sign in again (every 7 days if the Google app is still in Testing: [publish it](../docs/runbooks/google-cloud-setup.md#publish-the-app)).

The sign-in and the database are kept in `app/data/`, which Git ignores. Delete that folder to start again.

### When Google can't be reached

- The Hub shows the last Events and To-dos it loaded, and the bottom bar says "Offline · last updated 14:02". They're kept in `app/data/` too, so they still show after a restart, and on a new day the Calendar is pieced together from the days it loaded before. To spare the Pi's SD card, they're written when they change and otherwise hourly.
- Google requests give up after 10 seconds, so a dead connection never holds up the screen. Set `CALENDAR_SOURCE=sample` in `app/.env` to show sample Events, a sample Shopping list, sample To-dos and sample weather even when Google and home are set up.

## Show the real weather

Put home's latitude and longitude in `app/.env`, for example `HOME_LATITUDE=51.50` and `HOME_LONGITUDE=-0.12`. Two decimal places is close enough. The header then shows the current weather from [Open-Meteo](https://open-meteo.com/), which needs no key, and the highest chance of rain in the next three hours. It asks again every 10 minutes, and takes today's sunrise and sunset from the same forecast to switch between the Day and Evening themes. Until it has them, or with sample weather, it uses 07:05 and 16:40. If Open-Meteo can't be reached, the header keeps the last forecast for up to three hours, then hides the weather rather than show a stale forecast.

## Show the real energy prices

Put the Household's Octopus account number and API key in `app/.env`, as `OCTOPUS_ACCOUNT=A-1234ABCD` and `OCTOPUS_API_KEY=sk_live_…`. The key is on the Octopus account under Personal details, then API access. It can see the account and its bills, so keep it out of chats and commits.

The Energy section and the Today view's Energy card then show the account's Intelligent Octopus Go rates and Smart-charging slots, read from Octopus's GraphQL API ([ADR 0007](../docs/adr/0007-energy-from-octopus-rates-and-the-zappi.md)). While the car is plugged in, the Energy section also shows its battery, which Octopus hears from the car: on Using now, and as a line over the Today chart on its own 0–100% scale. The Hub keeps the readings in `app/data/energy.db` for a week. The Hub asks for the rates once a day, so a renewal at new prices is picked up, and for slots every 10 minutes while the car is plugged in and hourly while it isn't. It keeps both in `app/data/energy-tariff.json` and `app/data/energy-slots.json`, so they still show after a restart without internet, with "Octopus unreachable · last updated 14:02". The Off-peak window, 23:30 to 05:30, is part of the tariff and written into `src/lib/energy.ts`, with the Hungry appliances and how long each runs. If the account moves to another tariff, the Section says so instead of guessing its times. If Octopus or myenergi has been failing for an hour, the Today view's Energy card says "ask Ross". `CALENDAR_SOURCE=sample` shows sample energy too.

## Show the real usage from the Zappi

Put the Zappi's serial number and the myenergi account's API key in `app/.env`, as `ZAPPI_GLO_SN=12345678` and `ZAPPI_GLO_API_KEY=…`. The serial is on the Zappi and in the myenergi app. The key comes from https://myaccount.myenergi.com, under Products, then Advanced, then Generate new API key. Like the Octopus key, it never goes in chats or commits.

The Energy section then shows the Zappi's Live demand and the Car's state, asked for about once a minute, and today's and yesterday's House use and Car charging, from its per-minute history every 15 minutes. myenergi's API is unofficial, so everything that talks to it is in `src/lib/server/energy/myenergi.ts`. The Hub adds the minutes up into Half-hours and keeps them in `app/data/energy.db`, a cache that can be fetched again, so it isn't backed up. If the Zappi stops answering for five minutes, the Section says "Car charger not reporting since 14:02" and still shows the prices.

## Set up the real Chores

The Chores are imported once from `app/chores.json` on the Hub's first start with ADR 0012, then kept in its database. Until the family app can set them up on a phone, they can't be changed. For a new install before then, copy `app/chores.example.json` to `app/chores.json`, which Git ignores, before the first start, with the Household's Routines and Chores:

- Each **Routine** has an `id`, a `name` and a `from` time, in the order they happen. The current one is marked "Now".
- Each **Chore** has an `id`, a `name`, an `icon` (`teeth`, `bed`, `shirt`, `home`, `music`, `book` or `bin`), `stars` from 1 to 3, the `routines` it's done in, and `who` does it, by their names in the Household (capitals don't matter). Add `days`, such as `["Wed"]`, for a Chore that isn't every day.
- **Bonus jobs**, under `bonus`, are optional extras shown as **Up for grabs**. Each has an `id`, a `name`, `stars` from 1 to 3 and optional `days`. Any child can do one: they tap **Done it**, then their own badge, and the Stars go to them. Each job can be done once a day, by whoever's first; tapping it again offers **Undo**.
- History is recorded against the ids, so a `name` can change freely, but changing an `id` starts its history afresh. Bonus jobs and Chores can't share an id.

Ticks are kept in `app/data/hub.db`, a SQLite database ([ADR 0006](../docs/adr/0006-hub-owned-data-in-sqlite.md)). Without Chores, or with `CALENDAR_SOURCE=sample`, the Chores section shows sample Chores for Maya and Leo with a made-up week, kept in memory, which resets when the app restarts.

## Sign in to the family app's backend

The Hub signs in to the backend as itself, with a certificate from the Key Vault ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)). In the main checkout's `app/`, signed in with `az login`:

```
node scripts/backend-env.mjs
```

This puts `BACKEND_URL`, `ENTRA_TENANT_ID`, `ENTRA_SUBDOMAIN`, `BACKEND_API_CLIENT_ID`, `HUB_CLIENT_ID` and `HUB_CERTIFICATE` in `app/.env`, from the Key Vault, without printing them. The certificate holds the Hub's private key, so it never goes in a commit or a chat. On the Pi, the playbook puts the same in `hub.env`. [The sign-in runbook](../docs/runbooks/sign-in-setup.md), step 9, has the details.

With them, the Hub signs in once when it starts and asks the backend's `/me` who it is. The log says "Signed in to the backend as the Hub", or why not. It gets an app-only token by signing a client assertion with the certificate, keeps it until five minutes before it expires, and gets a new one if the backend turns it down. Without them, it doesn't try.

### Live updates

With the same settings, the Hub's server holds one live connection to the backend's Web PubSub, from a URL it gets with `GET /live`, and hears `{"list": "shopping", "seq": N}` after each change made anywhere. It logs each close, to find out whether a connection outlives its URL's 60-minute token (AB#82).

- When the connection closes, the Hub gets a new URL and connects again: a second after a failure, then twice as long each time up to 5 minutes, and quickly again once a connection has stayed up a minute.
- The log says "Live updates connected" and "Live updates closed after 1h 01m 05s: code 1006, reason …", or "Live updates couldn't connect". Never the URL, which holds the token.
- A `shopping` message refreshes the Shopping list, unless the Hub shows the sample one. Then `/api/changes`, a stream of server-sent events the screen listens to only then, tells the screen, which loads it again at once rather than at the next minute. A change made on a phone shows on the Hub in under a second. Other lists' messages are ignored.

### The Shopping list

With the same settings, the Shopping Section and Today card show the backend's Shopping list, the one the family app shows on phones. It moved there from Google Tasks in slice 5 (AB#103). The Google Tasks list was left as it was, and the Hub no longer reads it. Without the settings, or with `CALENDAR_SOURCE=sample`, it's the sample list.

- The list is all of `GET /lists/shopping/items?after=0`, asked for straight after a change at the Hub or a live update, and otherwise every 10 minutes while the live connection is open, or every minute while it isn't: the items still to get, newest first, then those ticked off in the last 10 minutes.
- Each add, tick, untick and remove is one operation to `POST /lists/shopping/operations`. The Hub makes the operation's id, and an added item's id, when the change is made, so sending it again after a lost answer changes nothing, and an item added offline keeps its id.
- While the backend can't be reached, changes wait in `app/data/shopping-backend-queue.json`, in order, the screen shows them at once with "Offline · 2 to send", and they're sent in a batch once it's back. While anything waits, the Hub tries again every 20 seconds, and straight away when live updates reconnect, then the screen loads the list again so Offline clears. With nothing waiting it asks for nothing extra. A change the backend turns down (422) is logged and dropped, and the ones after it are still sent.
- If the backend refuses the Hub's sign-in, the list says Offline, not Sign in needed, as nothing at the Hub can fix it, and the log says why.
- The last list is kept in `app/data/shopping-backend-cache.json`, apart from the Google one's files.
- **Regulars** (AB#110): the Regulars button beside Add item opens a panel of up to 24 regulars from `GET /lists/shopping/regulars`, leaving out what's on the Hub's list, queued adds included. Ticked ones go as one batch of adds, and a long press sends `dont_suggest` after asking. Both go through the queue, so they work offline. The last regulars are kept in `app/data/shopping-backend-regulars.json`, written only when they change, and shown while the backend can't be reached. The sample list has sample regulars.

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

Every merge to `main` that passes CI becomes a [GitHub release](https://github.com/rosskgraham/FamilyHub/releases), which the Pi installs within about five minutes, switching back if it doesn't answer its health check ([ADR 0004](../docs/adr/0004-pi-pulls-releases.md), [`ansible/roles/hub`](../ansible/README.md)). Versions are the UK date and CI's run number, such as `2026.10.31.57`, so they sort in the order they were made.

A release is `familyhub-<version>.tar.gz` and its SHA-256. It holds the built server and a `package.json`, and nothing else: the app has no runtime dependencies and no native code, so the same package runs on a PC and on the Pi. Before publishing, `scripts/release.mjs` unpacks it, starts it, and checks it answers with its version.

To run one, unpack it and start it with Node 24 from that folder. It reads `data/` from the folder it runs in (and, once, any old `household.json` and `chores.json`), and its settings from the environment:

```
node --env-file=.env build
```

It listens on port 3000, or `PORT`. `/api/health` answers `{"status":"ok","version":"2026.10.31.57"}`, which is what the Pi checks after switching to a new release.

Told to stop (SIGTERM, as the Pi restarts it for a release), it ends the screen's `/api/changes` streams and its live connection, so it exits in well under a second rather than waiting for systemd to kill it. The screen asks `/api/health` before its minute refresh and before going back to Today. While nothing answers, it keeps what it shows and tries again later, rather than loading a page into a refused connection and showing the browser's error page (AB#41).

## Layout

- `src/lib/time.ts`: UK time handling. Everything is shown in Europe/London time, whatever the machine's own time zone.
- `src/lib/household.ts`: Members and their colours.
- `src/lib/theme.ts`: the Day and Evening themes, and when each shows.
- `src/lib/sleep.ts`: the Sleep schedule, and whether the Hub is asleep. `src/lib/components/Sleep.svelte` is the Sleep screen.
- `src/lib/calendar.ts`: the Event type and grouping Events by day.
- `src/lib/server/calendar/`: where Events come from. `google.ts` reads Google Calendar, `fake.ts` is the sample week, `index.ts` picks one, and `cache.ts` keeps the last good Events for when Google can't be reached.
- `src/lib/server/google/auth.ts`: signing in to Google and keeping the sign-in fresh.
- `src/routes/settings/`: Settings: the clock, About this Hub, and the Household and Google (`src/lib/components/HouseholdSettings.svelte` and `MemberForm.svelte`): Members, their colours and Calendars, the lists, and signing in. `/setup` only redirects there now.
- `src/lib/server/hub-db.ts`: the Hub's database, `hub.db`, and its migrations. `household.ts` keeps the Household in it, `settings.ts` the choices, and `import-files.ts` imports the old files once.
- `src/lib/server/tasks/`: the To-dos' Google Tasks list. `google.ts` reads and changes a list, `queue.ts` holds changes made while Google can't be reached, and `feed.ts` keeps a list fresh, shows it from disk when Google can't be reached, and applies changes.
- `src/lib/server/shopping/`: the Shopping list. `backend.ts` is the backend's list, with its own queue of operations, and `fake.ts` the sample one. `src/lib/server/todos/`: the To-dos' reading of Google's tasks, and their sample list.
- `src/lib/server/backend/`: signing in to the backend as the Hub, and calling it. `live.ts` holds the live connection.
- `src/lib/server/changes.ts` and `src/routes/api/changes/`: telling the screen a list changed on a phone.
- `src/lib/components/ShoppingList.svelte`: the list on the Today view and in the Shopping section, with ticking off, adding and removing.
- `src/routes/api/shopping/`: the endpoint the screen calls to change the list.
- `src/env.ts`: the environment variables the app reads.
- `src/routes/`: the Today view (`+page.svelte`) and Week view (`week/`).

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

It shows sample data for now: a typical week of Events repeated for every week, sample weather, and a sample Shopping list whose ticks aren't saved. The "Sample data" label in the corner says so. Real Calendars come next; see [the Google Cloud runbook](../docs/runbooks/google-cloud-setup.md).

## Check types

```
npm run check
```

## Layout

- `src/lib/time.ts`: UK time handling. Everything is shown in Europe/London time, whatever the machine's own time zone.
- `src/lib/household.ts`: Members and their colours.
- `src/lib/calendar.ts`: the Event type and grouping Events by day.
- `src/lib/server/calendar/`: where Events come from. `fake.ts` is the sample week; a Google source goes beside it.
- `src/routes/`: the Today view (`+page.svelte`) and Week view (`week/`).

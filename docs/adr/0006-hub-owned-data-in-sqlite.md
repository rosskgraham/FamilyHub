# Data the Hub owns lives in SQLite on the Pi, backed up nightly to Google Drive

Chores are the first data the Hub owns rather than copies from Google: ticks, Stars, streaks, marbles and Rewards. They live in one SQLite database on the Pi's writable data partition, the same place as the Google sign-in token. The system disk stays read-only. On the PC the database is in `app/data/`, which Git ignores. The app uses Node's built-in `node:sqlite`, so nothing native has to be compiled. SQLite's transactions and write-ahead log mean a power cut can't leave the data half-written.

The database records what happened, not totals: each tick and un-tick with its time and who it was for, each Reward claimed, and each correction a grown-up makes. Stars, streaks and marbles are worked out from that record. A rule change, such as how many missed days a streak forgives, then applies to history correctly, the logic can be unit-tested as plain functions, and it's always possible to see why a child has the Stars they have.

Grown-ups can override: give or take Stars, or fix a wrong tick. An override is added to the record, with who made it and why, rather than editing or deleting what happened. Overrides are made at the Hub, because nothing outside the house can reach it (ADR 0002). How the Hub knows a grown-up is tapping is decided with Reward approval.

Every night the Hub takes a consistent snapshot with SQLite's online backup and uploads it to the Household's Google Drive. It keeps the last 14 snapshots. The upload uses the `drive.file` permission, which only lets the Hub see files it created. Losing at most a day of Chores is acceptable. When the Pi is rebuilt, the setup scripts restore the latest snapshot, so a dead SD card still means re-running one command. Adding the permission means signing in to Google again once.

## Considered Options

- **JSON files, like the sign-in and setup choices:** the simplest, but each save rewrites a whole file, and streaks and weekly views mean loading everything into code. Fine for one slice, outgrown by streaks.
- **Google Sheets as the store:** survives a dead Pi and is visible on phones, but needs the internet, so the Hub would still need a local copy and an offline queue. It also invites accidental edits to the children's data.
- **Azure Table Storage or Cosmos DB:** managed and backed up, but it breaks ADR 0002, needs the internet, and needs Azure credentials on the Pi, which the requirements rule out.
- **The browser's own storage:** no server work, but it's lost on a rebuild, invisible to the server, and can't be backed up.
- **Backups pulled to Alex's PC over the home network:** no new cloud permission, but it only works while the PC is on and at home.

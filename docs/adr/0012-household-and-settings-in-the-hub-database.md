# The Household and the Hub's settings live in its database, managed in Settings

The Household (each Member's name, colour, initial and Calendar), Everyone's colour and Calendar, which Calendar holds birthdays, which Google Tasks lists are the Shopping list and To-dos, the clock format, and the Chores' Routines and jobs all live in the Hub's SQLite database, `hub.db`, beside the Chores' record (ADR 0006). They're backed up with it every night.

They used to be spread across three places. `household.json` and `chores.json` came from the Key Vault, copied to the Pi by Ansible (ADR 0008). `settings.json` held the Calendar choices in the Hub's data folder, and wasn't backed up. The Key Vault now holds only secrets and settings that differ between environments, such as API keys and home's location. Personal settings that the family changes don't belong there: changing one meant editing a secret in Azure and running the playbook.

Grown-ups manage the Household from the Settings screen at the Hub, which takes over the old setup page: Members, their colours and Calendars, the Task lists, and signing the Hub in to Google. That part of Settings is locked until it's held for a second, as setup was hidden behind a long press, because it can sign the Hub out of Google. Names are typed with the on-screen keyboard (ADR 0009). Nothing outside the house can reach the Hub (ADR 0002), so this is the only place to change them for now.

Each Member has an id that never changes, so renaming someone keeps their Calendar and their Stars. Ids used to be made from names, so a rename lost both. A Member who has Chores can't be removed until their Chores are moved to someone else.

The Chores' Routines and jobs are stored too, but not edited at the Hub. Setting them up is too much for a touch screen: it belongs in the family app on phones (ADR 0010). Until that's built, the Chores stay as imported, and changing them waits for it. As the backend can't reach the Hub, the Chores' setup will then live in the backend, and the Hub's copy becomes its local cache.

Because the Household now lives only in `hub.db`, a rebuilt Pi gets it back by restoring the nightly backup, as it already must for the Chores' record, or by entering it again in Settings. There's no runbook for restoring a backup yet.

On first start the Hub imports `household.json`, `chores.json` and `settings.json`, keeping the ids they gave, so nothing is lost. After that, the files are ignored. The Key Vault's `household-json` and `chores-json` secrets are deleted only once a release with the import has started on the Pi, as the playbook takes a file off the Pi when its secret goes.

## Considered Options

- **Keep household.json and chores.json in the Key Vault:** no work, but every change is an Azure edit and a playbook run, and the vault mixes personal settings with secrets.
- **JSON files in the data folder, edited at the Hub:** simple, but not backed up, unlike the database, and a rename still needs ids kept somewhere.
- **The backend, edited from the family app:** where the Chores' setup is heading, but the backend isn't built, and the Hub must keep working without the internet (ADR 0002), so it needs its own copy anyway.
- **Unlock with a grown-up's PIN instead of a hold:** stronger, but a PIN is one more thing to remember and type, and a hold matches what setup did.

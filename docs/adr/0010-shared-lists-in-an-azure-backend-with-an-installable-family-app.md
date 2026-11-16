# The Shopping list and To-dos move to a backend in Azure, with an installable family app

The Shopping list and To-dos move off Google Tasks (ADR 0003) into a backend of the Hub's own in Azure, and the Household's phones use a family app instead of the Google Tasks app. Google Tasks lists can't be shared between personal Google accounts, so with Tasks every phone has to be signed in to the Household's account, and the Tasks API can't create a repeating To-do or show one before it's due. Each Member, the children included, now signs in to the family app with their own Google account, through Microsoft Entra External ID. The backend only lets in the Household's accounts, from a list kept in the Key Vault, and children can do everything grown-ups can. This is more to build than the alternatives, on purpose: the project is also for learning, and the stack is the one the project's owner uses at work.

The backend is a Python API (FastAPI) in a container on Azure Container Apps, scaling to zero, with its data in Cosmos DB on the free tier. Web PubSub tells clients when something has changed, and they fetch the change. The server decides everything that could otherwise be written twice: how changes merge, and when a repeating To-do is next due (RFC 5545 rules). Clients send each change as an operation with its own ID, kept in a queue until the server confirms it, as the Hub's Google Tasks queue already does. A device always shows its own change straight away. After a quiet spell, other devices may wait a few seconds for the API to start.

The family app is an installable web app built with SvelteKit, like the Hub, served by Azure Static Web Apps' free tier at its `*.azurestaticapps.net` address. Every phone in the Household is Android, and Chrome installs the app to the home screen, so there's no app store and no APK. It works offline in the shop, keeping the lists in the browser's own storage, and updates itself. Notifications use Web Push.

The Hub becomes one more client. It keeps its own copy in SQLite (ADR 0006), so the wall still works when the internet's down, and it still only makes outbound connections, so nothing outside the house can reach the Pi. ADR 0002's "no cloud server" no longer holds. The Pi signs in to the backend with an Entra app registration's certificate, which the setup scripts copy from the Key Vault, allowed only to read and change the lists. So the Pi now holds an Azure credential besides the Application Insights connection string. Everything is Bicep, deployed by the pipeline, on free tiers (ADR 0008). The [design notes](../../design/family-app/notes.md) hold the details, the slices and the open questions.

## Considered Options

- **Keep Google Tasks, with the Household's account on every phone:** no work, but the lists stay the Household account's rather than each Member's, and repeats stay hidden.
- **Microsoft To Do or Todoist:** shared lists across personal accounts and a ready-made app, but someone else's app, model and limits.
- **Lists the Hub owns on the Pi, with a phone web app:** no cloud, but phones away from home would need a way in to the Pi.
- **A React Native (Expo) app:** installed from an APK or Google Play. The web app needs neither, updates itself, and shares the Hub's SvelteKit.
- **Azure SQL Database:** the engine used at work, but its free serverless offer is about 55 hours awake a month and takes up to a minute to wake, and the always-on Basic tier isn't free.
- **Azure Database for PostgreSQL:** free only for a new account's first year. Free Postgres outside Azure would take the data out of the Bicep setup.
- **A TypeScript backend:** would share merge and repeat rules with the Hub and the app, but Python was chosen.

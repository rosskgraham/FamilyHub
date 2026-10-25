# The Shopping list lives in Google Tasks, not Google Keep

The Household kept its shopping list in Google Keep, but Keep's API is only available to Google Workspace customers, not personal Google accounts, so the Hub can't read or change a Keep note. The list moves to a Google Tasks list in the Household's single Google account: the Hub reads and writes it through the Tasks API, and phones use the Google Tasks app, which works offline in the shop.

## Considered Options

- **A list the Hub owns, with its own phone web app:** the most build work, and it would mean the Hub must be reachable from outside the house. Still an option if Tasks falls short.
- **Todoist:** a polished shared list with an API, but a new app for everyone, when the Household already lives in one Google account.

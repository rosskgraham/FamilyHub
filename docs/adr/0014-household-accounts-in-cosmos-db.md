# The Household's accounts live in Cosmos DB, keyed by Object ID, naming the Hub's Member

The backend lets in only the Household's accounts (ADR 0010). Which accounts those are is kept in Cosmos DB, in an `accounts` container beside the lists, not in the Key Vault as ADR 0010 said. There's one item per account. Its `id` is the account's Object ID in the FamilyHub External ID tenant, which is also the container's partition key, and its `memberId` is that Member's id on the Hub.

ADR 0012 has since made the Key Vault a place for secrets and settings that differ between environments only, not personal settings that the family changes. Which phone accounts are the Household's is one of those. Cosmos DB is where the backend's own data already lives, the API already has its data role, and the family app will be able to change the list later, which it never could in the Key Vault. Until then, Ross adds and removes items by hand in the portal's Data Explorer, as the [sign-in runbook](../runbooks/sign-in-setup.md) says. Bicep gives Ross the same data role as the API for that, as the account has no keys.

Each account is named by its Object ID, which Entra never changes, rather than its email address, which Google lets people change. Each one points at the Member's id from the Hub's `hub.db` (ADR 0012), which also never changes, even when the Member is renamed in Settings, so a change made on a phone can be shown at the Hub with the right name and colour. The Hub's database can't be reached from the backend (ADR 0002), so the id is copied from the Pi by hand, once per account.

Each signed-in request reads the caller's item: a point read, which costs 1 RU of the free tier's 1000 RU/s. So adding or removing an account counts from the next request, with no cache to wait for and no restart. The Hub signs in as itself with an app role, not as an account, so it has no item.

Partly replaces ADR 0010, where the list was a Key Vault secret.

## Considered Options

- **A Key Vault secret, as ADR 0010 said:** simple, and read as a Key Vault reference in an app setting with no code. But it mixes personal settings into the vault, against ADR 0012, the function app needs one more role, a change waits for a restart, and the family app could never edit it.
- **Map each account to the Member's name:** easier to read in Data Explorer, but goes wrong when someone is renamed in Settings.
- **A list of allowed Object IDs, with nothing else:** the least to set up, but who made each change would have to be worked out again in slice 2 or 3.
- **An Entra group or app role assignment in the External ID tenant:** Entra would decide who gets in, and the token would say so. But it's more set-up by hand in Entra, the tenant isn't in Bicep, and the backend would still need to know which Member each account is.

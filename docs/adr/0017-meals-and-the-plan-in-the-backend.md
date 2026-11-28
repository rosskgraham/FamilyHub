# Meals and the dinner plan live in the backend, as operations like the Shopping list's

The meal planner's saved meals and its dinner plan are kept in the backend (ADR 0010), not in the Hub's SQLite as requirements item 8 said. They're in Cosmos DB's existing `lists` container, in a partition of their own (`listId` `meals`), changed by operations through `POST /meals/operations` and caught up with `GET /meals?after=n`, the same counter-and-log pattern as the Shopping list. The Hub keeps an offline copy, as it does of the Shopping list.

- **Shared data belongs in the backend.** Since ADR 0010, data the Household changes from more than one place lives there. Meals are planned at the Hub first, but phones will plan them later (#10), and the Shopping list they feed is already there. Putting them in SQLite would mean moving them again.
- **The same pattern, nothing new to learn or run.** Operations with ids made on the device mean an offline change can be sent again safely, and the log gives the order and who did what. The same container and transactional batch, with no new Bicep resource, stay in the free tier's shared throughput.
- **A plan day names a saved meal.** One-offs, like a takeaway, are saved meals with no ingredients. There's one meal per date, and planning a date again replaces it. Dates are the Household's local dates, YYYY-MM-DD, and the server never interprets a time zone.
- **Removing a meal leaves its plan days pointing at it.** Devices show such a day as empty. Past plan days are kept, so nothing has to clean them up.
- **Ingredients are a plain list.** Requirements item 8's "always buy" and "usually in" rule is dropped: when adding a meal's ingredients to the Shopping list, each starts unticked, and the Household knows what's in the cupboard.

Changes requirements item 8.

## Considered Options

- **SQLite on the Pi, as requirements item 8 said:** works offline without a copy, but phones could never reach it (ADR 0002), so meals would have to move once phones plan them.
- **A container of their own:** cleaner to look at, but a new Bicep resource and its own share of the free tier's throughput, for data that fits the lists' pattern exactly.
- **Storing the plan inside each meal:** fewer documents, but planning a date would change a meal, and finding a date's dinner would mean reading every meal.

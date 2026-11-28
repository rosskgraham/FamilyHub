# Meals mockups

The meal planner (Feature #96), approved by Ross on 27 November 2026. A snapshot of boards A to C from the design
canvas: https://claude.ai/artifact/FZFKcD6vRouMZEUkuM71XA. Boards D to G, planning a day, the Today card and adding
ingredients to Shopping, are for AB#99 and AB#100. The `.dc.html` files are the boards' sources, which render on the
canvas. The built screens' screenshot tests are `app/e2e/__screenshots__/meals.png` and `meal-editor.png`, with their
`-evening` versions.

| File              | Board                                                          |
| ----------------- | -------------------------------------------------------------- |
| `a-meals.dc.html` | A · Meals: this week (AB#99) and the saved meals               |
| `b-edit.dc.html`  | B · Editing a meal: renaming an ingredient, the keyboard below |
| `c-saved.dc.html` | C · Before the plan (AB#98 on its own): saved meals only       |

## Approved (27 November 2026)

- A Meals tab after Shopping. The saved meals A–Z, three columns across the full width until AB#99 adds the week on the
  left. Each shows its name and "N ingredients · first three", or "No ingredients".
- Tap a meal to edit it. Add meal opens the same panel, empty, with the keyboard on the name.
- The editor sits over the Section, with the Hub's own keyboard below it. Tap an ingredient to rename it, × removes it,
  and Return on the last one opens a new ingredient, so a list can be typed in one go. Order is kept, as typed.
- Done saves, Cancel drops the changes, and Remove meal asks first and says which planned day goes empty.
- Offline, edits are queued and the meal shows "Saving…" until the backend has it, as Shopping items do.

## Built differently

- Add meal, Done and the ingredient being typed into use the Hub's ink colour, not the mockup's blue: the Hub's
  palette has no blue (as with Regulars, AB#110).
- The keyboard's Return key says "Next" in the editor, so it isn't confused with the panel's Done.

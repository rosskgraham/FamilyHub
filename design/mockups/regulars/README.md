# Regulars mockups

Regulars at the wall (AB#110), approved by Ross on 27 November 2026. A snapshot of boards A and B from the design
canvas: https://claude.ai/artifact/5eFssaa8viBkFq1j4LxWPe (boards C to E are AB#107 and AB#111). The `.dc.html` files
are the boards' sources, which render on the canvas. The built panel's screenshot tests are
`app/e2e/__screenshots__/regulars.png` and `regulars-evening.png`, beside the Shopping Section's `shopping.png`.

| File                | Board                                                  |
| ------------------- | ------------------------------------------------------ |
| `a-section.dc.html` | A · The Shopping Section: Regulars beside Add item     |
| `b-panel.dc.html`   | B · Regulars on the Hub: up to 24, three ticked, Add 3 |

## Approved (27 November 2026)

- A Regulars button beside Add item opens a panel over the screen: up to 24 regulars, best first, nothing ticked.
- Tap to tick. "Add 3 to Shopping" adds each as its own item, closes the panel and says "Added 3 to Shopping".
- A long press asks "Stop suggesting Kitchen roll?" (Stop suggesting / Keep), as a remove asks at the wall. It comes
  back if anyone adds it again.
- Items already on the list aren't offered. Offline, the panel shows the last regulars fetched.

## Built differently

- Ticked tiles and the Add button use the Hub's ink colour, not the mockup's blue: the Hub's palette has no blue, and
  its tick boxes are ink in both themes.
- The question before stopping a suggestion is a small card over the panel, as the board's note describes but doesn't
  draw.

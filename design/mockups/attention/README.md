# Needs attention mockups

A count on the Settings cog, and the Needs attention list at the top of Settings (AB#71). `attention.html` draws each
screen at 1920×1080 over the screenshot test images (`app/e2e/__screenshots__/week.png`, `settings.png` and their
`-evening` versions), so the badge and the list sit on the real screen. The PNGs are renders of it.

| File               | Screen                                               |
| ------------------ | ---------------------------------------------------- |
| `attention-a.png`  | A · Two items, one needing doing: a red 2 on the cog |
| `attention-b.png`  | B · Settings opens with the list                     |
| `attention-c.png`  | C · Everything failing at once is one item           |
| `attention-d.png`  | D · Only something to watch: an amber 1 (Evening)    |
| `attention-e.png`  | E · The list in the Evening theme                    |

## Proposed (24 November 2026)

- **A number on the cog**, over its top-right corner and ringed in the bar's colour. It's red when any item needs
  doing, and amber when every item only needs watching. With nothing to show there's no badge.
- **Red items:** Google or the backup needs signing in again, no backup for 2 days, a source failing for an hour,
  can't reach the internet for an hour, the Pi hot from 80 °C. **Amber:** the Pi warm from 70 °C.
- **Needs attention is Settings' first card**, full width like Household and Google, edged in the colour of its worst
  item. Each line says what's wrong, what it means, what to do, and since when. The worst comes first.
- **Nothing to dismiss.** Items go away by themselves once fixed.
- **Every source failing together is one item**, "Can't reach the internet", not one per source.
- **The temperature item uses the highest reading in the last hour**, so it doesn't flicker on and off around 70 °C.
- **Amber is the theme's Peak orange** (`peak`), with white on it by day and ink on it in the evening. `warnBg`, used
  for the status line's Offline, is too faint on the bar for a badge this small.
- **The family's status line is unchanged**, including "Offline · updated…".

Render the PNGs again after changing `attention.html`: open it in Chromium and screenshot each `.frame`.

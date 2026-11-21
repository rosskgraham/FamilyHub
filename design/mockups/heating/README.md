# Heating mockups

The Nest's heating on the Hub (AB#42). `heating.html` draws each screen at 1920×1080 over the Today view's screenshot
test image (`app/e2e/__screenshots__/today.png`), in the Day theme, so the new parts sit on the real screen. The PNGs are
renders of it. The Evening theme uses the same layout with the Evening palette from `app/src/lib/theme.ts`.

| File | Screen |
| --- | --- |
| `heating-a.png` | A · The heating in the header, beside the outdoor weather |
| `heating-b.png` | B · The header's states: heating, warm enough, Eco, Off, not reporting, not set up |
| `heating-c.png` | C · The Heating panel, opened by tapping the header |
| `heating-d.png` | D · The panel at the 22° limit, and in Eco |

## Decided (21 November 2026)

- **In the header, beside the weather**, so it shows on every view with the header and takes no room from the Today view.
- **The Hub changes only the target temperature**, with − and + in 0.5° steps, between 16° and 22°. Like turning the
  dial, a change lasts until the Nest's next scheduled change. There's no timed boost.
- **Anyone can change it**, without unlocking, because the limits keep it sensible.
- **Mode, Eco and the schedule are never changed by the Hub.** They're shown, and changed in the Nest app.

Render the PNGs again after changing `heating.html`: open it in Chromium and screenshot each `.frame`.

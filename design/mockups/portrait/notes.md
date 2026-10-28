# Portrait: design notes

**Parked (28 October 2026).** An exploration, not a decision, kept for later; no code yet. One thing it already affects: the screen bought for v1 should have a wall mount that can rotate and touch that still works rotated, so portrait stays possible. Mockups: the `.dc.html` files here, published at https://claude.ai/artifact/DALzVs9xQPJ5Asckhk9bch.

## The idea

The Hub should work with the screen mounted either way: 1920×1080 landscape as today, or 1080×1920 portrait. Portrait suits a narrow bit of wall, such as beside a door frame or the fridge. It keeps everything the landscape Today view has, with the same sizes, so it reads the same from 1–3 metres.

## How the Today view stacks

From the top, in the 1856px between the 32px margins:

| Part | Height | Notes |
| --- | --- | --- |
| Header | 128 | Clock, date and weather fit on one row at 1016px wide, with the gaps tightened from 32px to 24px. |
| Next up | 168 | The same dark card, full width. |
| Later today | 34 + up to 3 rows of 76 | The same rows, with "+N more today" past three. |
| Coming up | what's left, about 630 | **The choice below.** |
| Shopping | 484 | Moves under the calendar, in two columns of four, with Add item below. Seven items fit before "+N more". |
| Bottom bar | 96 | Five tabs (Today, Day, Week, Shopping, Chores) and the status chip. |

The landscape Today view has the Shopping list as a column on the right. Portrait has no room beside the calendar, so it goes underneath, and two columns keep it short.

## Two ways to lay out Coming up

**A · A row per day (recommended).** Each of the next five days is a full-width row, its weekday and date on the left and its Events as chips that wrap onto a second line.
- Shows five days, not four, because rows use the width well.
- Reads like a list, top to bottom, which suits a tall screen.
- About six chips fit in two lines; a busy day ends with "+N more", as now (Saturday: five and "+7 more").
- How many chips fit depends on the length of their titles, so the fit arithmetic has to measure chip widths, or assume a width per chip, rather than just count rows.

**B · A 2 × 2 grid of day cards.** The landscape day columns, folded into a square.
- Closest to landscape, so the code and the look carry over nearly unchanged; each card is a column of fixed-height rows, which the existing `fitColumn` already handles.
- Only four days, and each card fits about five rows (Saturday: four and "+8 more").
- Reading order is less obvious: across, then down.

I'd go with **A**. A fifth day is the biggest gain portrait offers, and the row layout looks designed for the tall screen rather than squeezed into it.

## What portrait means for the other views

- **Week (sketch C):** seven full-width rows, one per day, today outlined and past days greyed, as the landscape week columns are. Each row holds three or four lines of chips, so a busy Saturday shows about eight and "+N more".
- **Day:** easy. The landscape Day view already lays Events out in two columns of rows; portrait makes it one column of up to about 18 rows.
- **Shopping:** one or two columns of about 20 rows, scrolling down rather than sideways.
- **Chores:** the two lanes stack: each child's lane becomes a full-width band about 750px tall, which holds the open Routine and the folded ones as now. Three children would need the lanes side by side again, at 330px wide, or the folded rows hidden.
- **Header and bottom bar:** fit as they are. The status chip has to stay short ("Sample data", "Updated 08:14"); longer messages such as "Calendar needs signing in again" would need to wrap or move into the header.

## What portrait means for the app

- **The stage.** The app draws a fixed 1920×1080 stage and scales it to the window. Portrait would add a second stage, 1080×1920, chosen by the window's shape (taller than wide) or by a setting. Following the window's shape needs no setting and lets a PC browser window try both; a setting is more predictable on the Pi, where the screen's rotation is set in the OS.
- **Fixed heights.** What fits is worked out from fixed heights (`fit.ts`, and constants like `MAIN = 744` in the Today view), never measured. Each view needs a second set of numbers for portrait. Most are the same values in a different arrangement; Coming up as rows (option A) is the one genuinely new calculation.
- **Screenshot tests.** Every view gets a portrait screenshot too, doubling the set: one Playwright project per orientation, with viewports of 1920×1080 and 1080×1920.
- **The Pi.** Raspberry Pi OS rotates the display with one setting, and the touchscreen's touch input has to be rotated with it. The screen's VESA mount has to allow portrait, and its speakers should still face the room.

## Open questions, for when it's picked up

1. **A (rows) or B (grid)** for Coming up?
2. **How the Hub picks portrait:** from the window's shape, or a setting in the repo?
3. **Is portrait for v1,** or the first thing after it? The screen you buy decides whether the mount and touch rotation work, so it's worth checking before ordering.
4. **The status chip:** keep it short in portrait, or move it into the header so the bottom bar has more room?
5. **Chores with three children** in portrait: three narrow lanes, or full-width bands that scroll?

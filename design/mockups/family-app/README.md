# Family app mockups

The family app on a phone (AB#10, slice 3). `phone.html` draws each screen at 390×844, a common Android size, in the Hub's Day theme (light) and Evening theme (dark) from `app/src/lib/theme.ts`, which the app follows from the phone's setting. The PNGs are renders of it, light on the left and dark on the right. Sample items only.

| File          | Screen                                                     | Story     |
| ------------- | ---------------------------------------------------------- | --------- |
| `phone-a.png` | A · Sign in                                                | AB#56     |
| `phone-b.png` | B · Signed in with an account that isn't the Household's   | AB#56     |
| `phone-c.png` | C · The Shopping list                                      | AB#57     |
| `phone-d.png` | D · Adding, with the phone's keyboard up                   | AB#57     |
| `phone-e.png` | E · Changing or removing an item                           | AB#57     |
| `phone-f.png` | F · No signal, with changes waiting, and Undo after remove | AB#58     |
| `phone-g.png` | G · The sign-in has run out                                | AB#56, 58 |
| `phone-h.png` | H · Nothing to get                                         | AB#57     |

## Decided (23 November 2026, with Ross)

- **Like the Hub's Shopping Section,** at a phone's size: items to get, then those ticked off in the last 10 minutes, struck through; a box to tick; "6 to get" under the heading.
- **The add box sits at the bottom,** where a thumb reaches it, and stays open after adding so several items go in one after another. A new item shows at the top straight away.
- **Tap the box to tick or untick. Tap the words to change or remove the item,** in a sheet from the bottom. The Hub ticks with a tap anywhere and removes with a long press, but a phone also needs rename (decided 22 November 2026), and a long press is hard to discover on a phone.
- **Removing doesn't ask first:** an Undo shows for a few seconds instead. The Hub asks Remove or Keep, as a wall gets brushed past.
- **Who's signed in is the circle at the top,** with their initial. Tapping it offers Sign out. It's one colour for everyone for now: Member colours live in the Hub's Settings, which the backend doesn't know.
- **No signal is a banner, not a block.** The list keeps working from the phone's copy; each waiting change is marked, and they send by themselves when the signal's back.
- **The logo gets an edge in the dark theme,** as its own dark tile nearly vanishes on the Evening background (seen on Ross's phone, AB#55).

- **A change made elsewhere just appears** (AB#59), at the Hub or on another phone, with no flash.

Render the PNGs again after changing `phone.html`: open it in Chromium and screenshot each screen's `.pair`.

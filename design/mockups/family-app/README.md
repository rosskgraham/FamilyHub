# Family app mockups

The family app on a phone (AB#10, slice 3). `phone.html` draws each screen at 390×844, a common Android size, in the Hub's Day theme (light) and Evening theme (dark) from `app/src/lib/theme.ts`, which the app follows from the phone's setting. The PNGs are renders of it, light on the left and dark on the right. Sample items only.

| File          | Screen                                                     | Story     |
| ------------- | ---------------------------------------------------------- | --------- |
| `phone-a.png` | A · Sign in                                                | AB#56     |
| `phone-b.png` | B · Signed in with an account that isn't the Household's   | AB#56     |
| `phone-c.png` | C · The Shopping list                                      | AB#57     |
| `phone-d.png` | D · Adding, with the phone's keyboard up                   | AB#57     |
| `phone-e.png` | E · Changing an item, in place                             | AB#79     |
| `phone-f.png` | F · No signal, with changes waiting, and Undo after remove | AB#58     |
| `phone-g.png` | G · The sign-in has run out                                | AB#56, 58 |
| `phone-h.png` | H · Nothing to get                                         | AB#57     |
| `phone-i.png` | I · Sign out, from the circle                              | AB#56     |
| `phone-j.png` | J · Swiping to remove                                      | AB#79     |
| `phone-k.png` | K · Picking a shop                                         | AB#86     |
| `phone-l.png` | L · Sorted for a shop                                      | AB#86     |
| `phone-m.png` | M · Dragging an item                                       | AB#86     |
| `phone-n.png` | N · Adding a shop                                          | AB#86     |

## Decided (23 November 2026, with Ross)

- **Like the Hub's Shopping Section,** at a phone's size: items to get, then those ticked off in the last 10 minutes, struck through; a box to tick; "6 to get" under the heading.
- **The add box sits at the bottom,** where a thumb reaches it, and stays open after adding so several items go in one after another. A new item shows at the top straight away.
- **Tap the box to tick or untick. Tap the words to change the item, in its row; swipe it either way to remove it** (24 November 2026, AB#79, replacing a sheet from the bottom for both). Done, or tapping anywhere else, saves; Back cancels; clearing the text puts the old text back. Both swipe directions remove until there's a second use for a swipe. Swiping is the only way to remove, with no hint. The Hub keeps a tap anywhere to tick and a long press to remove, asking first, as a wall gets brushed past.
- **Removing doesn't ask first:** an Undo shows for a few seconds instead. The Hub asks Remove or Keep, as a wall gets brushed past.
- **Who's signed in is the circle at the top,** with their initial. Tapping it offers Sign out. It's one colour for everyone for now: Member colours live in the Hub's Settings, which the backend doesn't know.
- **No signal is a banner, not a block.** The list keeps working from the phone's copy; each waiting change is marked, and they send by themselves when the signal's back.
- **The logo gets an edge in the dark theme,** as its own dark tile nearly vanishes on the Evening background (seen on Ross's phone, AB#55).
- **A change made elsewhere just appears** (AB#59), at the Hub or on another phone, with no flash.

## Decided (24 November 2026, with Ross, AB#57)

- **A removed item waits on the phone until its Undo has gone,** then the remove is sent, or at once if the app is put away. Undo just puts it back, and nothing reaches the backend: the backend never brings a removed item back.
- **Signing out with changes still waiting warns, but doesn't block** (AB#58): the circle's menu says how many haven't sent yet. Signing out clears the list from the phone, so they're lost.
- **Newest at the top, and it stays there:** the order is the one items were added in, so ticking, unticking or changing an item doesn't move it.

## Decided (25 November 2026, with Ross, AB#84)

- **Sort by the shop you're in** (K to N). A pill under the count says how the list is sorted: Newest first, or a shop. The pick stays on this phone. With Newest first there are no handles, and the list is as in C.
- **Items the shop hasn't placed come first, under a "Not placed yet" divider,** newest first, then the rest under "In Aldi order" (L, chosen over a list with no dividers, as the divider says why an item is out of walking order).
- **Only the handle on the right drags,** so the words still edit and the row still swipes to remove. Dropping an item teaches the shop where it goes. Ticked-off items can't be dragged.
- **A shop is added from the picker** (N), for the whole Household, and is picked on this phone.

Render the PNGs again after changing `phone.html`: open it in Chromium and screenshot each screen's `.pair`.

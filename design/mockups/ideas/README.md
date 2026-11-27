# Ideas mockups

The Ideas tab, where anyone in the Household sends an idea or says something's broken, and sees where every idea is
(AB#116), with Me too (AB#117). `ideas.html` draws each screen at 1920×1080 over the screenshot test images
(`app/e2e/__screenshots__/games.png`, `games-evening.png` and `keyboard.png`), so the tab sits on the real screen. The
PNGs are renders of it, with the sample Household.

| File          | Screen                                                  |
| ------------- | ------------------------------------------------------- |
| `ideas-a.png` | A · The Ideas tab: sending, and everyone's ideas        |
| `ideas-b.png` | B · Something's broken: who, which part, what happened  |
| `ideas-c.png` | C · I've got an idea                                    |
| `ideas-d.png` | D · No more today                                       |
| `ideas-e.png` | E · Me too: who's backing it                            |
| `ideas-f.png` | F · The Ideas tab in the Evening theme                  |

## Proposed (27 November 2026)

- **Ideas is a tab after Games.** The left card sends one: "I've got an idea" in the Word of the day's green, and
  "Something's broken" in the warning orange. The right card lists every idea.
- **Each idea shows who sent it and when, and where it is**, in kid words over five steps: Dad's thinking about it,
  Planned, Being built, Nearly there, and It's on the Hub!, whose steps turn green. A bug carries a "Broken · part"
  chip. One that hasn't reached the backend yet says "Not sent yet".
- **Not this time** is faded, with no reason, and goes after a week. **It's on the Hub!** goes after two weeks.
- **The form** asks who you are, which part (bugs only), and what happened or what the idea is, up to 200 characters,
  with a count. Send is greyed until it's all done. Choosing who you are shows how many you have left today. Sending
  closes the form, and the idea is at the top of the list straight away.
- **No more today** replaces the box once someone's sent 3, with no keyboard. Someone else can still be chosen.
- **Me too** (AB#117) asks who's backing it. The sender can't back their own idea, and a tick shows who already has.
  Tapping them again takes it back. The button goes once an idea is being built, and the count stays. The list puts
  the most backed first, then the newest.
- **Long ideas are cut to one line** on the list. If there are more ideas than fit, the list scrolls.
- **Member colours are only for people.** Where an idea is uses ink and green, so it's never confused with whose it is.

Render the PNGs again after changing `ideas.html`: open it in Chromium and screenshot each `.frame`.

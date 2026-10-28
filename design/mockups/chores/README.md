# Chores mockups

Source files for the FamilyHub Chores Mockups design: https://claude.ai/artifact/UXYD2wzyqUB5BvtWe6z38R

An exploration of a gamified chore chart for the children. All screens are 1920×1080, in the Day theme, using the sample Household.

| File | Screen |
| --- | --- |
| `Main.dc.html` | A · Chores, a lane per child (chosen) |
| `Board.dc.html` | B · Chores, one shared board (not chosen) |
| `Celebrate.dc.html` | C · Ticking off the last job of a routine |
| `Week.dc.html` | D · This week: Stars, streaks and the family goal |
| `Today.dc.html` | E · Today view with a chores glance |
| `canvas.json` | Board layout and titles for the design canvas |
| `notes.md` | How it works, what was decided, and what is still open |

The live artifact is the source of truth, as with the other mockups. `Celebrate.dc.html` imports `Main.dc.html` as its background, which only the design tool renders.

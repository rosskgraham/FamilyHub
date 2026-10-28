# Chores: design notes

A design for after v1, with the main choices made. No code yet. Mockups: [`canvas.json`](canvas.json) and the `.dc.html` files here, published at https://claude.ai/artifact/UXYD2wzyqUB5BvtWe6z38R.

## Decided (28 October 2026)

- **A lane per child** (board A), not a shared board.
- **Trust:** a child's tick counts straight away. No grown-up approves Chores.
- **Personal Rewards and the Family goal**, both.
- **A chime and an animation** when a child finishes a Routine.
- **Streaks survive a missed day:** one missed day doesn't break a streak, but two in a row do.
- **After v1** in the plan. It needs data that survives restarts, which comes with offline resilience.

## The idea

A Chores Section where the children tick off their own jobs at the Hub, earning Stars, keeping streaks and working together towards a family treat. It should feel like a game they want to play, never a nag board or a league table.

## How it works at the wall

- **One tap ticks a job off.** A child finds their lane and taps the job. There's no "pick who you are" step; the lane is the who. A second tap un-ticks it, the same as the Shopping list.
- **Jobs come in Routines:** Morning, After school and Evening. The current Routine is open and marked **Now**. Later ones show their start time but can still be ticked, so an early start isn't punished. A Routine that hasn't started yet folds into one line to save room.
- **Weekly jobs** (bins out on Wednesday) only appear on their day, with a **Weekly** tag.
- **Finishing the last job of a Routine** plays a short chime and brings up a celebration with an animation (board C): the Stars earned, any streak, and a big "Nice one!" button. It closes by itself after a few seconds, so the next child isn't blocked.
- **Midnight reset:** each day starts fresh. Unticked jobs simply don't count, with no red crosses and no carry-over debt. A streak survives one missed day and ends after two in a row.

## Gamification, kept kind

| Mechanic | What it is | Why |
| --- | --- | --- |
| **Stars** | Each job is worth 1–3 Stars, set by a grown-up. | Small, visible, immediate reward. |
| **Streaks** | "5 mornings in a row", "Teeth: 9 days in a row". One missed day doesn't break a streak; two in a row do. | Habit-building; shown as a positive, never as "you broke it", and one bad day doesn't wipe out a month. |
| **Swap your Stars** | Personal rewards with a Star price (choose Friday's film, 15 Stars). A grown-up says yes before Stars are swapped. | Gives Stars meaning without the Hub handling money. |
| **Family goal** | A marble goes in the jar on each **Full-house day**, when every child finishes all their jobs. 10 marbles = the treat (Cinema trip). | Co-operative: the children win together, so the older one helps the younger rather than beating them. |
| **Up for grabs** | Bonus jobs anyone can claim for extra Stars (empty the dishwasher). | Lets a keen child earn more without adding to the other's list. |
| **Shout-outs** | Automatic, specific praise on the week view ("Leo: bins out two weeks running"). | Recognition that isn't a ranking. |

Deliberately left out: leaderboards, "Maya beat Leo", lost Stars for missed jobs, and nagging sounds or flashing. Each child's Stars are shown in their own lane, never side by side as a score.

## Two layouts for the Chores Section

**A · A lane per child (chosen).** Each child gets a column in their colour with big 72px rows, an icon for each job, and their Stars in the corner. The right-hand side holds the Family goal and Up for grabs.
- Readable from across the kitchen; a child only has to find their own colour.
- Icons help a child who's still learning to read.
- Works when children have different jobs, which they will.
- Two children fit comfortably; three would need narrower lanes or the right-hand column folding away.

**B · One shared board (not chosen).** Jobs down the side, a column per child, a tick box in each cell; "–" where it isn't that child's job.
- Compact, and easy for a grown-up to scan who's done what.
- Shared jobs (brush your teeth) read once.
- Gets sparse and confusing when children have different jobs (half the cells are "–"); it reads more like a register than a game, and puts the children's progress side by side, which invites comparison.

## Where else it shows

- **Today view (board E):** a small Chores card above the Shopping list, with each child's progress through the current Routine and "All done" when finished. Tapping it opens the Chores Section. The Shopping list shows 4 items and "+2 more" to make room.
- **This week (board D):** each child's week, one circle per day (full = all Routines done), their streak and Stars, the Family goal, and the rewards they can swap Stars for.

## What grown-ups set up, and where

| Option | For | Against |
| --- | --- | --- |
| **`chores.json` beside `household.json` (recommended)** | Matches how the Household is already configured; a change is a reviewed edit, as the requirements want for settings; easy to hold Routines, Stars, days of the week and rewards. | Changing a job means editing a file, not tapping on a phone. |
| Google Tasks, one list per child | Editable from phones with no new app. | Tasks has no idea of Routines, Stars, days of the week or rewards, so most of it would be encoded in task titles or notes; and a tick at the Hub would mark the task done for everyone, every day, so the daily reset fights Tasks' model. |
| A settings screen on the Hub | Quick changes. | The requirements rule out a settings screen in v1, and the children could change their own chores. |

What a child ticks off (and their Stars, streaks and marbles) is new state that has to survive a restart and a power cut. That makes it the Hub's first data of its own that isn't a copy of something in Google, so it needs backing up. That probably deserves an ADR.

## Proposed glossary terms

- **Chore**: a job a child is expected to do, such as making their bed. *Avoid: task, to-do.* (Task already means a Google Tasks item.)
- **Routine**: a named group of Chores done at one time of day: Morning, After school, Evening.
- **Star**: what a child earns for ticking off a Chore.
- **Streak**: how many days in a row a child has finished a Routine or a particular Chore, allowing one missed day at a time.
- **Full-house day**: a day on which every child finished all their Chores.
- **Family goal**: the shared treat the children fill the jar for, one marble per Full-house day.
- **Reward**: something a child can swap Stars for, once a grown-up says yes.
- **Bonus job**: a Chore anyone can claim for extra Stars ("Up for grabs").

The sample Household's children are Maya and Leo; Alex and Sam are the grown-ups.

## Still open

1. **How does a grown-up approve a Reward?** On the Hub with a PIN, or out loud ("ask Alex"), with the Hub just recording it?
2. **Do the grown-ups get Chores too?** It would model the behaviour, but makes the Section busier.
3. **Volume and quiet hours:** a chime is decided, but should it be quieter or silent during Sleep hours?
4. **Where the Hub's own data lives:** ticks, Stars, streaks and marbles are the first data that isn't a copy of something in Google. How it's stored and backed up probably needs an ADR, made with offline resilience.

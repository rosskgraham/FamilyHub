# To-dos: design notes

A design for a To-dos Section and a Today view card, with the Shopping list on the Today view slimmed to a card. No mockups yet.

## The idea

The Household's jobs that aren't Chores, such as entering the meter readings or booking the car's MOT, live in a Google Tasks list called "Family Task List". Some happen once, some repeat. The Hub shows what's due today and what's overdue, and anyone can tick a To-do off at the Hub, or on a phone in the Google Tasks app.

To-dos aren't Chores. Chores are the children's, grouped into Routines, and earn Stars. To-dos are anyone's, and earn nothing.

## Decided

- **Google Tasks drives To-dos** (7 November 2026). The list lives in the Household's Google account, like the Shopping list ([ADR 0003](../../../docs/adr/0003-shopping-list-in-google-tasks.md)), so phones can add and edit To-dos today, with nothing new to install. The Hub never stores To-dos itself.
- **Repeats are set up on phones**, with all the Google Tasks app's options: every 2 weeks, the first Monday of the month, a set date and so on. The Hub doesn't know a To-do repeats, and doesn't need to.
- **No "after it was last done" repeats.** Google Tasks doesn't offer them, and none are needed.
- **To-dos are unassigned.** It's one shared list with no owner, so To-dos show without a Member's colour or initial.
- **At the Hub, only one-off To-dos can be added**, with the on-screen keyboard, like Shopping items. Repeating ones are made on a phone, because the API can't create them.
- **Tick off works as it does for Shopping:** struck through for 10 minutes so a mis-tap can be undone, then gone.
- **A To-dos Section, and a card on the Today view.**
- **The Today view's Shopping list becomes a card** with the count ("6 to get"), a quick **+ Add** button, and a tap through to the Shopping Section. The full list only ever showed its first few items there anyway, and the space goes to To-dos.

## What the Google Tasks API does with repeating tasks

A test against "Family Task List" on 7 November 2026, with a task repeating daily at 9:00 ("Rpt1"), a one-off task today at 9:00 ("Norpt"), and a second daily repeat ("Rpt2"):

- **A repeating task looks just like a one-off.** The API returns no repeat rule.
- **Times are dropped.** Due dates come back as the date at midnight UTC (`2026-11-07T00:00:00.000Z`), without the 9:00. The Hub can say "due today", never "due at 9:00".
- **Ticking off through the API is safe.** "Rpt1", ticked off by the Hub's API call, was marked `completed` with the same ID and due date. The phone still showed it repeating, with "Next: Tomorrow".
- **Ticking off on a phone looks the same**, plus `"hidden": true`, which is how the app moves it into its Completed section. The Hub must treat any `completed` task as done, hidden or not.
- **The next occurrence isn't listed yet.** After either kind of tick-off, the API showed no "Rpt1" or "Rpt2" for tomorrow. It most likely appears as a new task once it's due.

So the Hub can show what's due and overdue, and one-off To-dos with future dates. It can't show a repeating To-do ahead of time.

## How it works at the wall

- **Today view card:** To-dos due today or overdue, overdue first, each with how late it is ("2 days late"). Ticking off works on the card itself.
- **To-dos Section:** overdue, today, and then what's coming, by date. One-off To-dos with a future date show there; repeating ones only once Google lists them. **+ Add** for a one-off To-do, with an optional due date.

## Open questions

- **Check the IDs when the repeats come back (8 November 2026):** read "Family Task List" again, to see whether "Rpt1" and "Rpt2" are listed for 8 November, and whether each is a new task with a new ID or the same task with a new due date. That decides how the Hub tells "ticked off today" from "due again".
- **To-dos without a due date:** on the Today view card, or only in the Section?
- **Old completed To-dos:** Google keeps them. The Hub should only ask for recent ones (`completedMin`), so the list stays small.
- **Where the card goes:** in the side column, where the Shopping list is now, above or below the Shopping card and the Energy card.
- **Which list is "Family Task List"** is chosen on the setup page, like the Shopping list.

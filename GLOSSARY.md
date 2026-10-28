# FamilyHub

A family wall display in the kitchen that shows the household's calendars, a shared shopping list, and quick controls, at a glance and by touch.

## Language

### People

**Household**:
The family the Hub serves, listed in `app/household.json`. Sample data uses a made-up Household: Alex, Sam, Maya and Leo.
_Avoid_: Users, accounts, family group

**Member**:
One person in the Household. Every Event and lane belongs to a Member or to Everyone.
_Avoid_: User, person, profile

**Everyone**:
The owner of Events on the Family calendar, which belong to the whole Household rather than one Member, such as bin day.
_Avoid_: All, family, shared

### The device

**Hub**:
The wall-mounted touchscreen in the kitchen, and the product as a whole.
_Avoid_: Screen, display, dashboard, tablet

**Section**:
One of the Hub's top-level areas, each for one job: Calendar, Shopping or Watch.
_Avoid_: App, tab, page, mode, screen

**Today view**:
The Hub's home view: what's next, the rest of today, the next few days, and the Shopping list. It sits outside the Sections, and the Hub returns here when left alone, unless something is playing in Watch.
_Avoid_: Home screen, main view, dashboard

**Day view**:
The Calendar section's view of one day's Events.
_Avoid_: Agenda, daily view

**Week view**:
The Calendar section's seven-day view of all Members' Events, one column per day.
_Avoid_: Calendar view, week columns

**Sleep**:
The Hub's overnight state: a dim clock and the next Event, on a set schedule. A touch wakes it briefly.
_Avoid_: Standby, screensaver, off, night mode

**Day theme / Evening theme**:
The light look the Hub uses until sunset, and the dark look it uses after.
_Avoid_: Light mode, dark mode, night mode

**Quick action**:
A one- or two-tap change made at the Hub: switching view or Section, or adding, ticking off or removing a Shopping item. Creating or editing Events is not a Quick action; that happens on phones.
_Avoid_: Shortcut, command

### Calendar

**Calendar**:
An existing Google calendar that the Hub reads Events from: a Member calendar or the Family calendar. The Calendar is the master copy; the Hub never holds the only copy of an Event.
_Avoid_: Feed, source, account

**Member calendar**:
The Calendar belonging to one Member. By house rule, an Event for only one Member goes on that Member's calendar.
_Avoid_: Personal calendar, my calendar

**Family calendar**:
The one Calendar for Events that involve the whole Household.
_Avoid_: Shared calendar, combined calendar, household calendar

**Event**:
Something happening at a time or on a day, as recorded in a Calendar.
_Avoid_: Appointment, entry, booking

**Multi-day event**:
An Event that spans more than one day, such as half term or a work trip. It's shown as one span across its days, not repeated on each.
_Avoid_: Long event, recurring event

### Shopping

**Shopping list**:
The Household's one shared list of things to buy.
_Avoid_: Grocery list, list, basket

**Shopping item**:
One thing on the Shopping list, either still to get or ticked off.
_Avoid_: Entry, product, line

**Tick off**:
Mark a Shopping item as got. It stays on the list, struck through, until the end of the day, so a mis-tap can be undone.
_Avoid_: Complete, check, done

**Remove**:
Take a Shopping item off the list straight away, for one added by mistake.
_Avoid_: Delete, clear

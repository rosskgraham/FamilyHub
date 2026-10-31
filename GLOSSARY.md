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
One of the Hub's top-level areas, each for one job: Calendar, Shopping, Chores, Watch or Energy.
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
Mark a Shopping item as got, at the Hub or on a phone. It stays on the list, struck through, for 10 minutes, so a mis-tap can be undone, then drops off.
_Avoid_: Complete, check, done

**Remove**:
Take a Shopping item off the list straight away, for one added by mistake.
_Avoid_: Delete, clear

### Chores

**Chore**:
A job a child is expected to do, such as making their bed, ticked off at the Hub. A Chore can be in more than one Routine, such as brushing teeth morning and evening, and each is ticked off separately.
_Avoid_: Task (a Google Tasks item), to-do, job

**Routine**:
A named group of Chores done at one time of day, such as Morning or Evening. The one whose time it is shows as "Now".
_Avoid_: Schedule, list, session

**Star**:
What a child earns for ticking off a Chore or doing a Bonus job, 1 to 3 each. Each child's Stars add up over time, separately.
_Avoid_: Points, score

**Bonus job**:
An extra job, shown as Up for grabs, that any child can do for Stars. It can be done once a day, by one child or by several together, and each child who did it gets its Stars.
_Avoid_: Extra chore, task

### Energy

**Peak rate / Off-peak rate**:
The two prices per kWh on the Household's Intelligent Octopus Go tariff. They're fixed for the tariff's term: the Off-peak rate in the Off-peak window and Smart-charging slots, the Peak rate at all other times.
_Avoid_: Day rate, night rate, unit rate, tariff (the whole product)

**Off-peak window**:
23:30 to 05:30 every night, when the whole house pays the Off-peak rate.
_Avoid_: Night, cheap hours, economy

**Smart-charging slot**:
A time Octopus schedules the car to charge, through Škoda's connection to the car, sometimes outside the Off-peak window. While it lasts, the whole house pays the Off-peak rate.
_Avoid_: Dispatch (Octopus's word), boost, bonus slot

**Half-hour**:
One of the periods each day is measured and costed in, starting on the hour or half past: 48 a day, or 46 and 50 when the clocks change.
_Avoid_: Slot, period, interval

**Hungry appliance**:
An appliance the Hub suggests when to start, so it finishes while electricity is cheap: the dishwasher, washing machine or tumble drier, each listed in the repo with how long it runs.
_Avoid_: Device, load

**Live demand**:
The power the house is drawing from the grid right now, measured by the Zappi's grid clamp.
_Avoid_: Usage now, load, consumption

**Car charging**:
Electricity the Zappi delivered to the car.
_Avoid_: EV usage, charger load

**House use**:
Electricity the house drew from the grid, less Car charging.
_Avoid_: Home usage, consumption, base load

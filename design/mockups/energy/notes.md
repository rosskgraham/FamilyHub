# Energy: design notes

A design for an Energy Section and a Today view card. Mockups: [`canvas.json`](canvas.json) and the `.dc.html` files here, published at https://claude.ai/artifact/Bc4q9HusqZVHkW77NC8U7H.

## The idea

The Household is on Octopus's **Intelligent Octopus Go 12M Fixed** tariff: two prices fixed for 12 months, an Off-peak rate from 23:30 to 05:30 and a Peak rate the rest of the day. Octopus also schedules the car's charging, through Škoda's connection to the car, and a Smart-charging slot outside the Off-peak window makes the whole house cheap while it lasts. The Hub shows whether electricity is cheap now, when it next will be, when to run the dishwasher, washing machine and tumble drier, what the house is using right now, and what each day cost, split into House use and Car charging.

## Decided

- **An Energy Section plus a card on the Today view** (31 October 2026).
- **The Car's share comes from the Zappi**, not from Octopus. Octopus only sees the meter, which can't tell the car from the kettle. The car's own app (Škoda) has no official API, and the unofficial one doesn't report energy charged, so it isn't used.
- **No Home Mini.** Live demand comes from the Zappi's grid clamp instead.
- **The Hub only reports.** It doesn't control the Zappi or the car's charging; Octopus and the myenergi app do that.
- **Costs are usage only**, without the standing charge.
- **Hungry appliances:** the dishwasher (3 hours), washing machine (1 hour) and tumble drier (2 hours).
- **Brought forward** to milestone 11, before the Pi, to build while the hardware is on order.
- **Intelligent Octopus Go, not Agile** (31 October 2026). The first design assumed Agile, with a price for every Half-hour. With two fixed rates, a price chart and Price bands say nothing, so the Section now shows Peak and Off-peak times, Smart-charging slots and usage instead. The Agile design is in this folder's history.
- **How the Hub talks to Octopus and myenergi:** [ADR 0007](../../../docs/adr/0007-energy-from-octopus-rates-and-the-zappi.md).

## Where the data comes from

| What | From | Key needed | How fresh |
| --- | --- | --- | --- |
| Peak and Off-peak rates | Octopus GraphQL API: the account's current electricity agreement and its unit rates | Yes: account number and API key | Fixed for the term; checked daily so a renewal is picked up |
| When the Off-peak window is | The tariff's rules, written into the Hub: 23:30 to 05:30 | No | Fixed |
| Smart-charging slots | Octopus GraphQL API: `flexPlannedDispatches` for the car, `completedDispatches` for ones already past | Yes | Rescheduled through the day; checked every few minutes while the car is plugged in |
| Live demand, Car status | myenergi cloud API, the Zappi's status (`cgi-jstatus-Z`) | Yes: serial and API key | About a minute |
| House use and Car charging per minute | myenergi cloud API, the Zappi's day history (`cgi-jday-Z…`) | Yes | Minutes |

The myenergi API is unofficial: myenergi issues the key but publishes no documentation, so the endpoints come from community work and could change without notice. A test against the Household's real account on 31 October 2026 confirmed that the zappi GLO works with it, through a virtual hub on server `s18`:

- **Status** gives grid demand in watts (`grd`), whether the car is plugged in (`pst`), the charging state (`sta`) and energy this session (`che`, kWh).
- **Day history** gives one row per minute, with grid import (`imp`) and energy delivered to the car (`h1d`) in joules. There's no solar, so `exp` and `gen` are absent. House use is `imp − h1d`.
- **A normal day returned 1,441 rows**, one more than there are minutes. Adding up must not count a minute twice, and must cope with clock-change days (23 or 25 hours).

A test against the Household's Octopus account on 31 October 2026 found:

- **The rates come only from GraphQL.** Octopus's REST products list doesn't include the tariff, and its unit-rates endpoint returns nothing for it. The account's agreement returns the two rates, but not the times they apply.
- **Octopus controls the car through Škoda, not the Zappi.** The account's smart device is the car itself, so slots show up only in Octopus.
- **Past slots are listed too.** `completedDispatches` gives each slot's start and end, including Half-hours just outside the Off-peak window, so a Half-hour can be costed after its slot has gone.

## How it works at the wall

- **Price now:** Peak or Off-peak and the rate, such as "27.4p · Peak".
- **Next cheap:** the next Smart-charging slot if one comes before 23:30, otherwise the Off-peak window, with its rate. During a cheap time, when it ends.
- **Using now:** Live demand, refreshed about every minute, with the Car's state when it's plugged in.
- **Today:** a bar for each Half-hour so far, House use and Car charging stacked, over a strip showing which Half-hours were Peak, Off-peak or a Smart-charging slot, and today's cost so far.
- **Best time to run:** for each Hungry appliance, when to start it so it finishes while it's cheap: in a Smart-charging slot long enough for it, otherwise between 23:30 and 05:30 minus its run time ("23:30–02:30" for the 3-hour dishwasher).
- **Yesterday:** House use and Car charging in kWh and £, and how much of the House use was Off-peak.

## The Today view card (board C)

Above the Shopping list: Live demand, today's cost so far, and a plug icon, blue when the car is plugged in and struck through when it isn't. A Smart-charging slot gets a line when one is on or next; the Off-peak window doesn't, as it never moves. Tapping the card opens the Energy Section. The Shopping list shows 3 items and "+N more" to make room.

Built differently from board C, which showed the price now and the next cheap time (31 October 2026): with two fixed rates and a fixed window, those say the same thing every day, while usage, cost and the car change.

## Settings

- **The Octopus account number and API key**, and **the Zappi's serial and myenergi API key**, are secrets, in Azure Key Vault like the others, and in `app/.env` on the PC.
- **The rates aren't settings.** They come from the account's current agreement, so a renewal at new prices needs no change. The Off-peak window is part of the tariff, written into the Hub.
- **Hungry appliances and how long each runs** are in the repo, so changing them is a pull request.

## Still open

1. **Smart-charging slots in the bill:** Octopus says the whole house pays the Off-peak rate during a slot, but owners report exceptions, such as charging beyond six hours a day. The Hub will cost slots at the Off-peak rate and say so; checking against Octopus's own meter readings could come later.
2. **Whether the rates include VAT.** The account reports the same figure with and without VAT. The Hub shows the rates as Octopus reports them until a bill confirms which.

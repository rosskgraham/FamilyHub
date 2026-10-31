# Energy: design notes

A design for an Energy Section and a Today view card. No code yet. Mockups: [`canvas.json`](canvas.json) and the `.dc.html` files here, published at https://claude.ai/artifact/Bc4q9HusqZVHkW77NC8U7H.

## The idea

The Household is on Octopus's Agile tariff, where the price changes every Half-hour. The Hub shows what electricity costs now and later today, when to run the dishwasher or washing machine, what the house is using right now, and what each day cost, split into House use and Car charging.

## Decided (31 October 2026)

- **An Energy Section plus a card on the Today view.**
- **The Car's share comes from the Zappi**, not from Octopus. Octopus only sees the meter, which can't tell the car from the kettle. The car's own app (Škoda) has no official API, and the unofficial one doesn't report energy charged, so it isn't used.
- **No Home Mini.** Live demand comes from the Zappi's grid clamp instead, so one isn't needed.
- **The Hub only reports.** It doesn't control the Zappi or schedule charging; the Zappi's own app does that.
- **Prices first** (board A).
- **Price bands are relative to the day:** Cheap is the day's cheapest quarter of Half-hours, and Peak its dearest quarter.
- **Costs are usage only**, without the standing charge.
- **Hungry appliances:** the dishwasher (3 hours), washing machine (1 hour) and tumble drier (2 hours).
- **Brought forward** to milestone 11, before the Pi, to build while the hardware is on order.
- **How the Hub talks to Octopus and myenergi:** [ADR 0007](../../../docs/adr/0007-energy-from-octopus-rates-and-the-zappi.md).

## Where the data comes from

| What | From | Key needed | How fresh |
| --- | --- | --- | --- |
| Agile rates | Octopus REST API, the Agile product's standard unit rates for the home region | No | Published a day ahead, usually by 16:00 |
| Live demand, Car status | myenergi cloud API, the Zappi's status (`cgi-jstatus-Z`) | Yes: serial and API key | About a minute |
| House use and Car charging per minute | myenergi cloud API, the Zappi's day history (`cgi-jday-Z…`) | Yes | Minutes |
| Metered use, for checking against the bill | Octopus REST API, the meter's consumption | Yes: account API key | Often a day late |

The myenergi API is unofficial: myenergi issues the key but publishes no documentation, so the endpoints come from community work and could change without notice. A test against the Household's real account on 31 October 2026 confirmed that the zappi GLO works with it, through a virtual hub on server `s18`:

- **Status** gives grid demand in watts (`grd`), whether the car is plugged in (`pst`), the charging state (`sta`) and energy this session (`che`, kWh).
- **Day history** gives one row per minute, with grid import (`imp`) and energy delivered to the car (`h1d`) in joules. There's no solar, so `exp` and `gen` are absent. House use is `imp − h1d`.
- **A normal day returned 1,441 rows**, one more than there are minutes. Adding up must not count a minute twice, and must cope with clock-change days (23 or 25 hours).

Octopus's meter readings aren't needed for v1 of Energy. They could be added later to check the Zappi's totals against the bill.

## How it works at the wall

- **Rates:** today's 48 Half-hours as bars, coloured by Price band (Cheap, Normal, Peak) and labelled in a legend, so colour is never the only cue. A negative Agile rate is a bar below the line. Past Half-hours are greyed, the current one is outlined, and the Cheap window is shaded. After about 16:00 the chart runs on into tomorrow.
- **Best time to run:** for each Hungry appliance (Dishwasher, 2 hours), the start time of the Cheap window of that length, and its average rate.
- **Live demand:** "Using 0.8 kW", refreshed about every minute, with the Car's state when it's plugged in.
- **Each day:** House use and Car charging in kWh and £, each costed at the Agile rate of the Half-hour it happened in.

## Two layouts for the Energy Section

**A · Prices first (chosen).** Three tiles (price now, using now, cheapest left today), today's prices as a chart, Best time to run, and yesterday split into House and Car.
- Answers the daily question, "when should I run it?", at a glance from across the kitchen.
- Yesterday's cost is enough day to day; a week view can come later.

**B · Usage first (not chosen).** The last 7 days as stacked House and Car bars with each day's cost, and a smaller price-now, Rest of today and Cheapest window panel.
- Better for seeing what the car costs and spotting a heavy day.
- The prices get less room, and the chart is too small to pick a start time from.

## The Today view card (board C)

Above the Shopping list: the price now, Live demand, and the start and average rate of the cheapest 2 hours left today. Tapping it opens the Energy Section. The Shopping list shows 4 items and "+2 more" to make room, as with the Chores card.

## Settings

- **The Household's Octopus region and Agile product code** go in `app/.env`, because the region gives away roughly where home is.
- **The Zappi's serial and myenergi API key** are secrets, in Azure Key Vault like the others.
- **Hungry appliances and how long each runs** are in the repo, so changing them is a pull request.

## Still open

1. **Negative prices:** besides the bar below the line, should the price-now tile say "Paid 2.1p per kWh" when it happens? It's rare, mostly windy nights and sunny weekend afternoons.

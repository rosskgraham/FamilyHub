# Energy uses the Octopus account for rates and Smart-charging slots, and the Zappi, through myenergi's unofficial API, for usage

The Household is on Intelligent Octopus Go: a Peak rate and an Off-peak rate, fixed for the tariff's term, with the Off-peak window from 23:30 to 05:30, plus Smart-charging slots that Octopus schedules for the car and that make the whole house cheap while they last. The Energy Section needs those rates and slots, Live demand, and each Half-hour's use split into House use and Car charging. Octopus can't provide the split, because its meter sees one total and can't tell the car from the kettle. The Zappi can: it measures what it delivers to the car, and its grid clamp measures everything the house draws. So rates and slots come from Octopus and usage comes from the Zappi.

**Rates** come from the Household's Octopus account through Octopus's GraphQL API, signed in with a token from the account's API key. The account's current electricity agreement gives the tariff's name and its two unit rates, so when the fixed term renews at new prices the Hub picks them up by itself. Octopus's public REST API doesn't list this tariff, and the account gives the rates without the times they apply, so the Off-peak window (23:30 to 05:30, UK time) is written into the Hub as part of the tariff's rules, and the lower rate is the Off-peak rate. If the agreement's tariff stops being Intelligent Octopus Go, the Hub says so rather than guess. It checks once a day and keeps the answer on disk, so a restart without internet still knows the rates.

**Smart-charging slots** come from the same GraphQL API: the car's planned slots (`flexPlannedDispatches`, for the car's device on the account) and the ones that have happened (`completedDispatches`), which are needed to cost a Half-hour at the Off-peak rate after its slot has gone. Octopus controls the car's charging through Škoda's own connection, not through the Zappi, so Octopus is the only place the Hub can learn about slots. The Hub checks every few minutes while the car is plugged in, and hourly otherwise, because Octopus reschedules slots through the day. A slot only ever makes things cheaper, so if Octopus can't be reached the Hub shows the Off-peak window alone.

**Usage** comes from myenergi's cloud API, the one the myenergi app uses. myenergi issues the API key from the myaccount portal but publishes no documentation; the endpoints come from community work. A test against the Household's account on 31 October 2026 confirmed the zappi GLO works with it, and a test the same day confirmed the Octopus queries above. The Hub signs in with HTTP Digest, using the Zappi's serial and the API key, so the key never crosses the wire. It finds the account's server through `director.myenergi.net`, and then:

- polls the Zappi's status about once a minute for Live demand and the Car's state;
- fetches the day's per-minute history every 15 minutes, adds it up into Half-hours of House use and Car charging, and keeps those in the Hub's SQLite database (ADR 0006), each costed at the rate it fell in. They're a cache, not the Hub's own data: they can be fetched again from myenergi, so they aren't in the nightly backup.

All calls go out from the Pi, so nothing has to reach in (ADR 0002). The Octopus account number and API key, and the Zappi's serial and myenergi API key, are secrets in Azure Key Vault, placed on the Pi by the setup scripts. They never appear in logs or telemetry. The Octopus key can see the account's details and bills, so it's treated like the Google sign-in.

Because the myenergi API is unofficial, it can change or stop without notice, and the Hub is built to survive that:

- Everything myenergi-specific sits behind one module, tested against recorded responses with the serial and key removed. A change means fixing one module.
- Rates never depend on myenergi. If the Zappi stops reporting, the Energy Section still shows the price now, the next cheap time and the Best time to run, and replaces Live demand with a plain "Car charger not reporting since 14:02".
- A failed Octopus or myenergi sync for over an hour says so on the Today view's Energy card, "Prices not updating since 14:02 · ask Alex", and logs one line for the run of failures. Once the Hub has telemetry (ADR 0005), that line alerts Alex, the same as a failed Google sync.

The Hub only reads. It never changes the Zappi's mode, starts charging or asks Octopus for a slot; Octopus and the myenergi app keep doing that.

## Considered Options

- **The two rates as settings in `app/.env`:** no Octopus key on the Hub, but no Smart-charging slots, and someone has to remember to change the settings when the fixed term renews.
- **Octopus's REST API for the rates:** documented, but its products list doesn't include this tariff, and its unit-rates endpoint returns nothing for it.
- **Octopus's own consumption data:** official, documented, and readable with the same key, but one total with no Car split, and usually a day late. It may be added later to check the Zappi's totals against the bill.
- **An Octopus Home Mini, read over Octopus's GraphQL API:** near-live, but still one total with no Car split, and it needs extra hardware.
- **The car's own API (MySkoda):** Škoda has no official API, and the unofficial one reports the battery's charge level but not the energy charged.
- **OCPP from the Zappi:** myenergi can relay the Zappi to an OCPP platform, but only from its cloud to a server the internet can reach, which breaks ADR 0002. A charger can also only be linked to one platform at a time, and Octopus already controls the car's charging.
- **A separate clamp meter on the car's circuit (for example Shelly or OpenEnergyMonitor):** local and documented, but it needs new hardware in the consumer unit fitted by an electrician, to measure what the Zappi already measures.

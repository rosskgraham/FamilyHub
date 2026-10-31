# Energy uses Octopus for rates and the Zappi, through myenergi's unofficial API, for usage

The Energy Section needs three things: Agile rates, Live demand, and each Half-hour's use split into House use and Car charging. Octopus can't provide the split, because its meter sees one total and can't tell the car from the kettle. The Zappi can: it measures what it delivers to the car, and its grid clamp measures everything the house draws. So rates come from Octopus and usage comes from the Zappi.

**Rates** come from Octopus's public REST API, the standard unit rates of the Household's Agile product and region. They need no key. The product code and region letter are settings in `app/.env`, because the region gives away roughly where home is. Octopus releases a new Agile product every year or two, so a switch means changing the setting. The Hub fetches rates a few times a day and keeps them, so the chart survives a restart and an outage, and checks again after 16:00 until tomorrow's rates are there.

**Usage** comes from myenergi's cloud API, the one the myenergi app uses. myenergi issues the API key from the myaccount portal but publishes no documentation; the endpoints come from community work. A test against the Household's account on 31 October 2026 confirmed the zappi GLO works with it. The Hub signs in with HTTP Digest, using the Zappi's serial and the API key, so the key never crosses the wire. It finds the account's server through `director.myenergi.net`, and then:

- polls the Zappi's status about once a minute for Live demand and the Car's state;
- fetches the day's per-minute history every 15 minutes, adds it up into Half-hours of House use and Car charging, and keeps those in the Hub's SQLite database (ADR 0006). They're a cache, not the Hub's own data: they can be fetched again from myenergi, so they aren't in the nightly backup.

All calls go out from the Pi, so nothing has to reach in (ADR 0002). The serial and API key are secrets in Azure Key Vault, placed on the Pi by the setup scripts. They never appear in logs or telemetry.

Because the myenergi API is unofficial, it can change or stop without notice, and the Hub is built to survive that:

- Everything myenergi-specific sits behind one module, tested against recorded responses with the serial and key removed. A change means fixing one module.
- Rates never depend on myenergi. If the Zappi stops reporting, the Energy Section still shows prices and the Best time to run, and replaces Live demand with a plain "Car charger not reporting since 14:02".
- A failed myenergi sync for over an hour alerts Alex, the same as a failed Google sync.

The Hub only reads. It never changes the Zappi's mode or starts charging; the myenergi app keeps doing that.

## Considered Options

- **Octopus's own consumption data:** official, documented and free, but one total with no Car split, and usually a day late. It may be added later to check the Zappi's totals against the bill.
- **An Octopus Home Mini, read over Octopus's GraphQL API:** near-live, but still one total with no Car split, and it needs extra hardware.
- **The car's own API (MySkoda):** Škoda has no official API, and the unofficial one reports the battery's charge level but not the energy charged.
- **OCPP from the Zappi:** myenergi can relay the Zappi to an OCPP platform, but only from its cloud to a server the internet can reach, which breaks ADR 0002. A charger can also only be linked to one platform at a time.
- **A separate clamp meter on the car's circuit (for example Shelly or OpenEnergyMonitor):** local and documented, but it needs new hardware in the consumer unit fitted by an electrician, to measure what the Zappi already measures.

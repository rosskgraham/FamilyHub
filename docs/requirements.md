# FamilyHub requirements

What the Hub must do, how well, and in what order. Terms are defined in the [glossary](../GLOSSARY.md); the reasons behind the bigger choices are in the [ADRs](adr/). Agreed on 25 October 2026.

## Goals

- A wall display the Household actually uses instead of checking phones for the day's plan.
- A build worth doing for its own sake: the journey matters as much as the result, so interesting and challenging work is welcome.
- Held to the same standard as production software at work. Over-engineering is acceptable.

## The Household

Alex, Sam, Maya and Leo. Everyone sees every Event and can use every Quick action; there are no PINs or adult-only features.

## Hardware

- Raspberry Pi 5 running the Hub full-screen in a browser ([ADR 0001](adr/0001-web-app-on-raspberry-pi.md)).
- 15.6″ 1920×1080 touchscreen, landscape, wall-mounted near a socket, read from 1–3 metres. It must take touch over USB, have built-in speakers and VESA holes, and power its backlight down when the Pi stops sending a picture. Sleep behaviour is tested on the bench before anything is mounted.
- Sound comes from the screen's speakers over HDMI.
- Motion sensor wired to the Pi's GPIO pins (after v1).

## v1 scope

### Calendar

- Reads Google Calendar from the Household's one Google account: each Member calendar plus the Family calendar.
- Events on a Member calendar show in that Member's colour with their initial. Events on the Family calendar belong to Everyone.
- House rule: an Event for one Member goes on that Member's calendar. The Hub never guesses who an Event is for.
- Read-only: Events are created and edited on phones, never at the Hub.
- A change made on a phone appears on the Hub within 1 minute, and straight away when someone touches the Hub after it's been idle.
- A Multi-day event shows as one bar across its days in the Week view, and as "day 2 of 5" in the Today view's coming days.
- The clocks changing and bank holidays come from Google's UK Holidays calendar subscribed to the Family calendar, not from Hub code.

### Shopping

- The Shopping list is a Google Tasks list in the Household's account, replacing the Keep note ([ADR 0003](adr/0003-shopping-list-in-google-tasks.md)).
- At the Hub: add a Shopping item with the on-screen keyboard, Tick off with a tap (struck through until midnight, so it can be undone), and Remove with a swipe or long press.
- Phones use the Google Tasks app, which works offline in the shop.
- A change made in the shop appears on the Hub within 1 minute.

### Layout and navigation

- The Today view is home: what's next, the rest of today, the coming days, the Shopping list and the weather.
- Sections: Calendar (Day view and Week view; no Month view), Shopping and, after v1, Watch.
- A bar along the bottom switches between the Today view and the Sections.
- After about 2 minutes without a touch, the Hub returns to the Today view, unless something is playing in Watch.
- The [mockups](../design/mockups/) are the visual reference.

### Weather

- From Open-Meteo, for home only, in °C.
- Current conditions, today's high and low, and the chance of rain for the next few hours.

### Sleep

- Sleep on a fixed overnight schedule (for example 22:00–06:30): a dim clock and the next Event.
- A touch wakes the Hub; it goes back to Sleep after about 2 minutes untouched.

### Look and locale

- Day theme until sunset, Evening theme after, with sunset times from Open-Meteo.
- UK time zone, 24-hour clock, British date formats and English, °C, weeks start on Monday.

### Legibility (tested)

- Text meets WCAG AA contrast in both themes.
- No text smaller than about 20px at 1080p.
- A Member is never shown by colour alone; their initial is always there too.
- Touch targets are at least 64px.

### When things go wrong

- With no internet, the Hub keeps showing what it last loaded, labelled "last updated 14:02", and queues Quick actions until it reconnects.
- If the Google sign-in is withdrawn or a sync has failed for a long time, the Hub shows a plain banner such as "Calendar needs signing in again, ask Alex" and alerts Alex.
- The Household never sees raw error messages.

## After v1

1. **Watch:** YouTube from a "Kitchen" playlist that Members add to from their phones. Search with an on-screen keyboard comes later. Ads play without YouTube Premium.
2. **Motion sensor:** wakes the Hub on approach, and lets it sleep in the daytime when nobody's around.
3. **Alexa:** adding Shopping items by voice.

Out of scope: Spotify (Alexa already handles it), the Month view, and creating or editing Events at the Hub.

## Architecture and operations

- **Software:** SvelteKit with strict TypeScript, providing both the screen and a small server.
- **Where it runs:** everything runs on the Pi, and nothing is reachable from the internet ([ADR 0002](adr/0002-everything-runs-on-the-pi.md)). Google and Open-Meteo are checked for changes rather than pushing them.
- **Google:** one free Google Cloud project, used only for the sign-in. It asks for read-only calendar access and read-write Tasks access, and is set to "In production" so the sign-in doesn't expire every 7 days. A runbook in the repo covers the setup.
- **Releases:** every merge to `main` builds a versioned release. The Pi pulls it, checks it's healthy, and rolls back automatically if not ([ADR 0004](adr/0004-pi-pulls-releases.md)).
- **Pi setup:** built entirely from Ansible scripts in the repo, so a dead SD card means re-running one command. The system disk is read-only so a power cut can't damage it, a watchdog restarts the app if it crashes or hangs, security updates are automatic, and SSH is by key only.
- **Settings:** member calendars and colours, sleep schedule, location and the Tasks list name live in a settings file in the repo, applied by the setup scripts. A change is a pull request. There's no settings screen in v1.
- **Secrets:** stored in Azure Key Vault (Standard tier, which costs effectively nothing). The setup scripts run from Alex's PC, read the secrets with his Azure sign-in, and place them on the Pi. The Pi holds no Azure credentials apart from the Application Insights connection string. The Google sign-in token is created on the Hub and lives only there. No secret is ever in the repo.
- **Monitoring:** the app uses OpenTelemetry for traces, metrics and logs, sent through an OpenTelemetry Collector on the Pi to Azure Application Insights ([ADR 0005](adr/0005-telemetry-via-otel-collector-to-app-insights.md)). The screen's browser code reports through the server. The Collector strips Event titles, Shopping items and names before anything leaves the house, and this is tested. Alerts go from Azure Monitor to Alex when a sync has failed for over an hour or the Hub stops reporting.

## Engineering practice

This is where the project ends up, not what each step must have from day one. Early milestones aim for something that works, keeping only the foundations that are painful to add later: strict TypeScript, fake data by default, and no secrets in the repo. The rest arrives step by step.

- Strict TypeScript, linting and auto-formatting.
- Vitest unit tests on the logic that's easy to get wrong: turning Google data into Events and Shopping items, the offline queue, Sleep and theme timing.
- Playwright end-to-end tests of every view, including screenshot comparisons.
- GitHub Actions runs all checks on every pull request. Work goes in small pull requests, even solo.
- Renovate keeps dependencies up to date.
- Fake data is the default on the PC, in CI and in screenshot tests. A "FamilyHub Test" calendar and "Test shopping" Tasks list are used only for deliberate checks against the real APIs. Only the Pi uses the Household's real data.
- The repo stays private.
- New terms go in the glossary, and decisions that are hard to reverse and surprising get an ADR.

## Milestones

1. Repo, requirements and mockups.
2. The Today, Day and Week views on the PC with fake data, checked against the mockups.
3. Google Calendar.
4. Google Tasks.
5. Weather.
6. A bare Pi set up from scripts, showing the Hub full-screen.
7. Sleep and screen power, and the Day and Evening themes.
8. Offline resilience.
9. Mounted on the wall: **v1**.
10. Watch.
11. Motion sensor.
12. Alexa.

The README's progress table shows where things stand.

## v1 is done when

- It's on the kitchen wall and the Household has used it for two weeks.
- Nobody goes back to checking their phone for the day's plan.
- Calendar, Shopping, weather and Sleep all work.
- It survives a Wi-Fi drop, and after a power cut it comes back up by itself.

There's no deadline. The aim is something on the wall, even rough, within a month or two.

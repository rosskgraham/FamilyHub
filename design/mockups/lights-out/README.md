# Lights out mockups

Sleep and Lights out hours in Settings (AB#64). `settings.html` draws each screen at 1920×1080 over the Settings
screenshot test images (`app/e2e/__screenshots__/settings.png` and `settings-evening.png`), scrolled until Clock is out
of sight, so the new card sits on the real screen. The PNGs are renders of it. Lights out itself is a dark screen, so it
has no mockup.

| File              | Screen                                                  |
| ----------------- | ------------------------------------------------------- |
| `lights-out-a.png` | A · Sleep and Lights out in Settings, the defaults      |
| `lights-out-b.png` | B · Lights out turned off                               |
| `lights-out-c.png` | C · Lights out at the edge of Sleep                     |
| `lights-out-d.png` | D · A in the Evening theme                              |

## Proposed (24 November 2026)

- **One card below Theme**, full width like Household and Google, with Sleep above Lights out, so both pairs of times
  fit beside their words.
- **− and + move a time by 30 minutes** and save straight away, like the Clock and Theme choices. The buttons are 88 px,
  the times follow the clock format, and nothing needs the on-screen keyboard.
- **Lights out is On or Off.** Off keeps its times, faded, so turning it on again brings them back.
- **Lights out stays inside Sleep.** At the edge its button is greyed and a line says why, like the heating's 22° limit.
  Moving Sleep's times in past Lights out moves Lights out with them.
- **Not locked.** The hours can't sign anything out, so they don't need the hold that guards Household and Google.

Render the PNGs again after changing `settings.html`: open it in Chromium and screenshot each `.frame`.

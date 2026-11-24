# The Pi is wired only, with its Wi-Fi and Bluetooth switched off

The Pi is on the home network by its Cat6 cable. The setup scripts used to give it the home Wi-Fi from the Key Vault too, as a fallback for when the cable is out. That fallback never worked well, and it got in the way:

- **The Pi sits inside the Waveshare screen's metal housing**, which blocks most of the Wi-Fi signal. It joined now and then and failed the rest of the time. It had an address on 23 November 2026. From 07:37 on 24 November it failed to join, with "association took too long".
- **The router's Fast Roaming (802.11r) blocks the Pi's Wi-Fi anyway** (AB#35). It only joined with Fast Roaming turned off.
- **A link that comes and goes is a suspect for the Hub's short internet drops** (AB#62). When it joined, it got a default route on the same network beside the cable's. Its retries also fill the logs the investigation needs to read.
- **It gave no real protection.** If the cable fails, the Hub goes offline either way.

**The setup scripts switch off both radios at boot** with `dtoverlay=disable-wifi` and `dtoverlay=disable-bt`. They sit in the Pi's boot settings (`/boot/firmware/config.txt`) under an `[all]` of their own, so they apply whichever section comes before them. The Pi restarts when that changes, as boot settings only take effect from the next start. Nothing on the Hub uses Bluetooth, which is on the same chip and also inside the housing. **The scripts no longer give the Pi a Wi-Fi network,** and they delete the old NetworkManager connection. The `wifi-ssid` and `wifi-password` secrets can come out of the Key Vault.

Settings still shows which network the Hub is on. It reports whatever is true, so it now always says the cable, and it would show the Wi-Fi again if a USB Wi-Fi adapter were ever added outside the housing.

## Considered Options

- **Keep the Wi-Fi fallback:** it barely joins through the metal, Fast Roaming blocks it, and when it does join it adds a second default route.
- **Bring the Wi-Fi up only when the cable is out:** keeps a fallback on paper, but one that still has to get through the housing and past Fast Roaming. It would need its own switching logic to test and look after.
- **A USB Wi-Fi adapter on a short cable outside the housing:** a real fallback, but more hardware to buy and fit. That's for another day, if the cable ever proves unreliable.
- **Turn Fast Roaming off on the router:** it would let the Pi join, but it changes the whole home network for one device that still can't hear the router through the metal.

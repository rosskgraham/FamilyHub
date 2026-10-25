# Everything runs on the Pi, and nothing is reachable from the internet

The Hub's screen and the small server behind it both run on the Pi. The server fetches from Google and Open-Meteo, serves the screen to the Pi's own browser, and keeps the Google sign-in on the Pi. There is no cloud server and no open port. This works because phones use Google Tasks and Google Calendar directly, so nothing outside the house needs to reach the Hub. Remote access (for example over Tailscale) can be added later without changing this; exposing the Hub publicly should need a new decision.

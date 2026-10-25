# The Hub is a web app running full-screen on a Raspberry Pi

The Hub is a web app shown full-screen in a browser on a Raspberry Pi with a 10–20″ touchscreen, not a native app on a wall-mounted tablet. Building it is as much the point as having it, and a Pi makes the hardware part of that: the motion sensor that wakes the Hub wires straight to the Pi's GPIO pins instead of being worked around with a tablet's camera, and touchscreens in this size range are easy to get for a Pi, where tablets above about 11″ are rare and expensive.

## Considered Options

- **Native Android on a wall tablet (Kotlin):** less hardware work, but motion sensing is awkward and large tablets are costly.
- **Flutter on a Pi or Android:** one codebase for wall and phone, but no longer needed once the shopping list moved to Google Tasks, which already has a phone app.

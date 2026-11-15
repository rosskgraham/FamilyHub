# The screen is Chromium in cage, with the Hub's own on-screen keyboard

The Pi shows the Hub in Chromium, full-screen, inside [cage](https://github.com/cage-kiosk/cage): a Wayland compositor that shows one app and nothing else. There's no desktop, no taskbar and no window to close, so a stray touch can't leave the Hub, and if Chromium closes, systemd starts it again. cage runs as its own `kiosk` user, which can't log in, on the first console, which no longer offers a login prompt. The browser's profile lives in memory and starts fresh each time, so there's never a "restore pages?" prompt and nothing wears the SD card.

cage has no on-screen keyboard, so the Hub gets its own: a Svelte component that opens when a Shopping item or To-do is being typed. It can be sized to the Hub's 64px touch targets, looks like the rest of the Hub, and shows on the PC and in the screenshot tests like everything else. Until it's built, typing at the Pi needs a USB keyboard.

## Considered Options

- **labwc with squeekboard:** Raspberry Pi OS's own compositor and keyboard, which opens by itself when Chromium has a box to type in, so the Hub needs no change. But labwc is a desktop compositor with more to lock down, and the keyboard's size and look aren't the Hub's to choose or test.
- **The full Raspberry Pi OS desktop with Chromium in kiosk mode:** the most familiar, but a desktop sits behind the browser to fall into, and there's much more installed and running than the Hub needs.
- **X11 with a bare window manager:** the older way to do this. Raspberry Pi OS has moved to Wayland, and Chromium's touch support is better there.

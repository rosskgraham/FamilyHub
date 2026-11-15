#!/usr/bin/env bash
# Shows the Hub full-screen in Chromium. familyhub-kiosk.service runs it inside cage, which closes when
# Chromium does, and systemd then starts both again.
set -euo pipefail

# Wait for the Hub first: a page that never loaded shows the browser's own "can't connect" page, which
# never tries again. Once the Hub's page has loaded, the Hub copes with its server going away by itself.
until curl --fail --silent --max-time 5 "$FAMILYHUB_URL/api/health" >/dev/null; do
  sleep 2
done

# The profile lives in the service's runtime folder, in memory: each start is fresh, so there's never a
# "restore pages?" prompt, and the browser never writes to the SD card. The Hub keeps nothing in the browser.
#   --overscroll-history-navigation=0  a swipe (Remove on a Shopping item) never means Back
#   --disable-pinch                    the Hub scales itself to the screen; pinching would break that
exec chromium \
  --kiosk \
  --ozone-platform=wayland \
  --user-data-dir="$RUNTIME_DIRECTORY/chromium" \
  --disk-cache-size=52428800 \
  --no-first-run \
  --noerrdialogs \
  --password-store=basic \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  "$FAMILYHUB_URL"

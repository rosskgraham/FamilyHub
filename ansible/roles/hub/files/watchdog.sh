#!/usr/bin/env bash
# Restarts the Hub when it hasn't answered its health check three times in a row. systemd already
# restarts it when it crashes; this catches it hanging. familyhub-watchdog.timer runs it every minute.
set -uo pipefail

misses_file="$RUNTIME_DIRECTORY/misses"

# A stopped Hub is systemd's and the updater's business.
systemctl is-active --quiet familyhub.service || exit 0

if curl --fail --silent --max-time 10 "$FAMILYHUB_HEALTH_URL" >/dev/null; then
  echo 0 >"$misses_file"
  exit 0
fi

misses=$(($(cat "$misses_file" 2>/dev/null || echo 0) + 1))
if ((misses < 3)); then
  echo "$misses" >"$misses_file"
  echo "The Hub didn't answer its health check ($misses of 3)"
  exit 0
fi

echo 0 >"$misses_file"
echo "The Hub hasn't answered for three checks in a row, so restarting it"
systemctl restart familyhub.service

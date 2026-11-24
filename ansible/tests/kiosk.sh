#!/usr/bin/env bash
# Checks the kiosk's service and launcher on the stand-in Pi, which has no screen: systemd accepts the
# service, and the launcher waits for the Hub before opening it full-screen. A pretend Chromium stands in
# for the real one. run.sh runs it once the Hub is answering.
set -euo pipefail

fail() {
  echo "FAILED: $*" >&2
  exit 1
}

echo "systemd accepts the kiosk's service"
systemd-analyze verify /etc/systemd/system/familyhub-kiosk.service || fail "systemd-analyze verify"

echo "systemd accepts the screen service's unit, and node can load the service"
systemd-analyze verify /etc/systemd/system/familyhub-screen.service || fail "systemd-analyze verify the screen service"
node --check /usr/local/lib/familyhub/screen.mjs || fail "node --check screen.mjs"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin" "$work/runtime"
cat >"$work/bin/chromium" <<'EOF'
#!/bin/sh
printf '%s\n' "$@" >"$CHROMIUM_ARGS"
EOF
chmod +x "$work/bin/chromium"

launch() {
  PATH="$work/bin:$PATH" RUNTIME_DIRECTORY="$work/runtime" CHROMIUM_ARGS="$work/args" FAMILYHUB_URL="$1" \
    timeout 5 /usr/local/lib/familyhub/kiosk.sh
}

echo "The launcher waits while the Hub isn't answering"
status=0
launch http://127.0.0.1:3999 || status=$?
[[ $status == 124 ]] || fail "the launcher exited ($status) instead of waiting"
[[ ! -e "$work/args" ]] || fail "Chromium was opened before the Hub answered"

echo "The launcher opens the Hub full-screen once it answers"
launch http://localhost:3000 || fail "the launcher didn't open Chromium"
args=$(cat "$work/args")
for expected in --kiosk --ozone-platform=wayland "--user-data-dir=$work/runtime/chromium" \
  --overscroll-history-navigation=0 --disable-pinch http://localhost:3000; do
  grep -qxF -- "$expected" <<<"$args" || fail "Chromium wasn't given $expected"
done
[[ $(tail -n 1 <<<"$args") == http://localhost:3000 ]] || fail "the Hub's address isn't what Chromium opens"

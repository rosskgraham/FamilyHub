#!/usr/bin/env bash
# Plays out releases arriving on the stand-in Pi, from fake_releases.py: a working one, a broken one, a
# tampered one, enough to prune old ones, one emptied by a power cut, and the Hub hanging and crashing. run.sh runs it after the
# playbook has installed 2026.01.01.1.
set -euo pipefail

publish() { python3 /ansible/tests/fake_releases.py "$@"; }
# The tests start the updater far more often than its timer does, past systemd's limit of five starts in ten
# seconds, so the count is cleared each time.
update() { systemctl reset-failed familyhub-update.service; systemctl start familyhub-update.service; }
answers() { curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health | grep -q "\"version\":\"$1\""; }
current() { basename "$(readlink /opt/familyhub/current)"; }
installed() { ls /opt/familyhub/releases | sort | tr '\n' ' '; }
fail() {
  echo "FAILED: $*" >&2
  journalctl --no-pager -n 30 -u familyhub-update.service -u familyhub.service -u familyhub-watchdog.service >&2
  exit 1
}
wait_until() {
  for _ in $(seq 30); do "$@" && return 0; sleep 1; done
  return 1
}

# The tests decide when the updater and the watchdog run. Stopping the timer doesn't stop a run it has just
# started, which would have read "latest" already: a start below would join it and miss the new release.
systemctl stop familyhub-update.timer familyhub-watchdog.timer
while [[ $(systemctl is-active familyhub-update.service) == activating ]]; do sleep 1; done

echo "A newer release is installed and started"
publish 2026.01.02.2
update || fail "installing 2026.01.02.2"
answers 2026.01.02.2 || fail "the Hub isn't answering as 2026.01.02.2"
[[ $(current) == 2026.01.02.2 ]] || fail "current is $(current)"

echo "A release that won't start is rolled back, and isn't tried again"
publish 2026.01.03.3 --broken
if update; then fail "the broken release wasn't reported"; fi
answers 2026.01.02.2 || fail "the Hub didn't go back to 2026.01.02.2"
[[ ! -e /opt/familyhub/releases/2026.01.03.3 ]] || fail "the broken release was left behind"
since=$(date '+%Y-%m-%d %H:%M:%S')
update || fail "the broken release was tried again"
journalctl --no-pager --since "$since" -o cat -u familyhub-update.service | grep -q "failed its health check before" ||
  fail "the updater didn't say it skipped the broken release"

echo "A release that doesn't match its checksum isn't installed"
publish 2026.01.04.4 --tampered
if update; then fail "the tampered release wasn't reported"; fi
[[ $(current) == 2026.01.02.2 ]] || fail "current is $(current)"
[[ ! -e /opt/familyhub/releases/2026.01.04.4 ]] || fail "the tampered release was unpacked"

echo "Only the newest three releases are kept"
for version in 2026.01.05.5 2026.01.06.6 2026.01.07.7; do
  publish $version
  update || fail "installing $version"
done
[[ $(installed) == "2026.01.05.5 2026.01.06.6 2026.01.07.7 " ]] || fail "installed releases are $(installed)"

echo "A release emptied by a power cut is installed again"
# As on the Pi on 2026-11-23 (AB#60): the names survived, every file was empty, and the Hub couldn't start.
find /opt/familyhub/releases/2026.01.07.7 -type f -exec truncate -s 0 {} +
update || fail "repairing the emptied release"
answers 2026.01.07.7 || fail "the Hub isn't answering as 2026.01.07.7 after the repair"
[[ $(current) == 2026.01.07.7 ]] || fail "current is $(current)"
[[ -s /opt/familyhub/releases/2026.01.07.7/package.json ]] || fail "the repaired release is still empty"

echo "If the emptied release can't be downloaded again, the Hub goes back to the newest whole one"
find /opt/familyhub/releases/2026.01.07.7 -type f -exec truncate -s 0 {} +
mv /srv/releases/familyhub-2026.01.07.7.tar.gz /tmp/
if update; then fail "falling back wasn't reported"; fi
answers 2026.01.06.6 || fail "the Hub didn't go back to 2026.01.06.6"
[[ $(current) == 2026.01.06.6 ]] || fail "current is $(current)"
# Once the release can be downloaded again, it's installed as usual.
mv /tmp/familyhub-2026.01.07.7.tar.gz /srv/releases/
update || fail "installing 2026.01.07.7 again"
answers 2026.01.07.7 || fail "the Hub isn't answering as 2026.01.07.7 again"

echo "The watchdog restarts the Hub when it hangs"
hung=$(systemctl show --property MainPID --value familyhub.service)
kill -STOP "$hung"
for _ in 1 2 3; do systemctl start familyhub-watchdog.service; done
[[ $(systemctl show --property MainPID --value familyhub.service) != "$hung" ]] || fail "the hung Hub wasn't restarted"
wait_until answers 2026.01.07.7 || fail "the Hub didn't come back after hanging"

echo "systemd restarts the Hub when it crashes"
kill -KILL "$(systemctl show --property MainPID --value familyhub.service)"
wait_until answers 2026.01.07.7 || fail "the Hub didn't come back after crashing"

systemctl start familyhub-update.timer familyhub-watchdog.timer
echo "All release checks passed"

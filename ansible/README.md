# FamilyHub Pi setup

Ansible scripts that build the Hub's Raspberry Pi from a freshly written Raspberry Pi OS Lite, so a dead SD card means running one command again. To set up a Pi, follow [the Pi runbook](../docs/runbooks/pi-setup.md).

## Run the tests

With Docker running:

```
ansible/tests/run.sh
```

This lints the scripts, runs them twice in a Debian 13 container standing in for the Pi, fails if the second run changes anything, and then checks the result with `tests/verify.yml`. Then it unit-tests the updater and the screen service, `tests/kiosk.sh` checks systemd accepts the kiosk's and the screen service's units, and the kiosk's launcher waits for the Hub before opening it (with a pretend Chromium, as the container has no screen), and `tests/releases.sh` plays out releases arriving: a working one, one that won't start, one that doesn't match its checksum, enough to prune old ones, one emptied by a power cut (repaired, or with no download, swapped for the newest whole one), and the Hub hanging and crashing. The releases come from `tests/fake_releases.py`, served inside the container, rather than GitHub, and the Key Vault is `tests/fake_az.py`, a pretend Azure CLI answering from `tests/key_vault.json`. CI runs it all on every pull request.

## Layout

- `site.yml`: the playbook. It runs every role against the `hub` group.
- `inventory.yml`: the Pi, at `familyhub.local` or `FAMILYHUB_PI_HOST`, as `hubadmin`.
- `group_vars/all.yml`: settings the roles share, such as the Hub's user, its folders and when the Pi may restart.
- `roles/base/`: updates (downloaded over IPv4, as the home network's IPv6 doesn't always reach the internet), automatic security updates, UK time, SSH by key only, the firewall, and the Wi-Fi and Bluetooth switched off at boot, which restarts the Pi when that changes ([ADR 0015](../docs/adr/0015-the-pi-is-wired-only.md)).
- `roles/node/`: Node.js 24 from NodeSource.
- `roles/hub_user/`: the `familyhub` user the Hub runs as, and its release, data and config folders ([ADR 0004](../docs/adr/0004-pi-pulls-releases.md)).
- `roles/hub_config/`: the Hub's secrets, from the Key Vault ([ADR 0008](../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)). `files/read_key_vault.py` runs on the PC, signed in with `az login`, and reads the secrets named in `group_vars/all.yml`. Among them are the Hub's sign-in to the family app's backend: its settings, and its certificate with the private key, which goes into hub.env as base64 because it spans lines (`hub_env_base64`; [the sign-in runbook](../docs/runbooks/sign-in-setup.md), step 9). The role writes them to `/etc/familyhub/hub.env`, and takes off the Pi anything the vault no longer has. Its output never shows a secret. It's tagged `config`, so `--skip-tags config` leaves it out and `--tags config` runs only it.
- `roles/hub/`: the Hub as a systemd service, two timers and a path unit ([ADR 0004](../docs/adr/0004-pi-pulls-releases.md)):
  - `familyhub-update.timer` runs `files/update.mjs` every 5 minutes. It installs the newest GitHub release beside the current one, after checking its SHA-256, and switches the `/opt/familyhub/current` link to it. If the new release doesn't answer `/api/health` with its version within 90 seconds, it switches back and doesn't try that version again. It keeps the newest three releases. It writes a release's files to the SD card (`sync`) before switching to it, and again after, as a power cut soon after an update once left every file of a release empty and the screen black (AB#60). Every run also checks the current release is whole (its `package.json` names its version). If it isn't, the updater installs a release again, or, if it can't download one, switches to the newest whole release still installed. Before restarting the Hub, it clears systemd's count of failed starts, as a release that won't start soon passes systemd's limit, after which a plain restart is refused.
  - `familyhub-update.path` runs the same updater straight away when Check for updates is pressed in Settings (AB#105). The Hub can't start it itself, as it runs as its own user and the updater as root: it writes `/var/lib/familyhub/update-requested`, in its own folder, and systemd starts the updater when that file changes. The updater writes how it's going (checking, up to date, installing, installed or failed) to `/var/lib/familyhub-update/status.json`, which Settings reads.
  - `familyhub-watchdog.timer` runs `files/watchdog.sh` every minute, and restarts the Hub if it hasn't answered for three checks in a row. systemd restarts it straight away if it crashes.
- `roles/kiosk/`: the Hub full-screen on the Pi's screen ([ADR 0009](../docs/adr/0009-kiosk-is-chromium-in-cage.md)). `familyhub-kiosk.service` runs cage on the first console, as the `kiosk` user, through the login session in `files/familyhub-kiosk.pam`. cage runs `files/kiosk.sh`, which waits for the Hub to answer and then opens it in Chromium, with a fresh profile in memory. The Pi starts into it, and the first console no longer offers a login prompt. `familyhub-screen.service` runs `files/screen.mjs`, also as `kiosk`, for Lights out (AB#64): it asks the Hub's `/api/screen` every 30 seconds, reads the touchscreen, and switches the screen off with `wlr-randr` two minutes after the last touch in Lights out hours, and on again at a touch. Chromium doesn't see a touch made in the dark, so then it also tells the Hub to wake (`POST /api/screen`). If the Hub doesn't answer, it keeps the screen on.
- `roles/netcheck/`: a watch on the network, for the Hub's short internet drops (AB#62). `familyhub-netcheck.service` runs `files/netcheck.mjs` all the time, as a user of its own that can only ping and connect out. Every 5 seconds it asks each nameserver for a name, connects to public IPs over IPv4 and IPv6 without DNS, pings the router, reads which link has the default route and whether eth0 has a cable, and reaches www.googleapis.com the way the Hub does (a system lookup, and an HTTPS request with Node's fetch). It logs a line only when one of those changes, with how long the spell lasted: `journalctl -u familyhub-netcheck`. The role also keeps the journal across restarts, capped at 500 MB.
- `requirements.txt` and `requirements.yml`: the pinned Ansible and collections, used by the PC and the tests alike.
- `tests/`: the stand-in container, its inventory, the checks, the kiosk's checks, and the release scenarios.

## On the Pi

| Path | What's there |
|---|---|
| `/opt/familyhub/releases/<version>/` | Each installed release, owned by root, so the Hub can't change its own code |
| `/opt/familyhub/current` | A link to the release that's running |
| `/var/lib/familyhub/` | What the Hub writes: the Google sign-in and the databases (`HUB_DATA_DIR`) |
| `/etc/familyhub/` | The secrets in `hub.env`, from the Key Vault, which only root can read (`HUB_CONFIG_DIR`). On a Pi set up before ADR 0012, also the old `household.json` and `chores.json`, imported once into the Hub's database and then ignored |
| `/var/lib/familyhub-update/failed.json` | Releases that failed their health check and won't be tried again |
| `/var/lib/familyhub-update/status.json` | What the updater last did, for Check for updates in Settings |
| `/usr/local/lib/familyhub/` | The updater, the watchdog, the kiosk's launcher and the screen service |
| `/run/familyhub-kiosk/` | The kiosk's Chromium profile, in memory, emptied each time the kiosk stops |

The Hub listens on `127.0.0.1:3000` only, as the `familyhub` user, and can't write anywhere but `/var/lib/familyhub`.

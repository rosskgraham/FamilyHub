# FamilyHub Pi setup

Ansible scripts that build the Hub's Raspberry Pi from a freshly written Raspberry Pi OS Lite, so a dead SD card means running one command again. To set up a Pi, follow [the Pi runbook](../docs/runbooks/pi-setup.md).

## Run the tests

With Docker running:

```
ansible/tests/run.sh
```

This lints the scripts, runs them twice in a Debian 13 container standing in for the Pi, fails if the second run changes anything, and then checks the result with `tests/verify.yml`. CI runs it on every pull request.

## Layout

- `site.yml`: the playbook. It runs every role against the `hub` group.
- `inventory.yml`: the Pi, at `familyhub.local` or `FAMILYHUB_PI_HOST`, as `hubadmin`.
- `group_vars/all.yml`: settings the roles share, such as the Hub's user, its folders and when the Pi may restart.
- `roles/base/`: updates, automatic security updates, UK time, SSH by key only, and the firewall.
- `roles/node/`: Node.js 24 from NodeSource.
- `roles/hub_user/`: the `familyhub` user the Hub runs as, and its release, data and config folders ([ADR 0004](../docs/adr/0004-pi-pulls-releases.md)).
- `requirements.txt` and `requirements.yml`: the pinned Ansible and collections, used by the PC and the tests alike.
- `tests/`: the stand-in container, its inventory, and the checks.

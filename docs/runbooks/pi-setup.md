# Set up the Pi

The Hub's Pi is built entirely by the Ansible scripts in [`ansible/`](../../ansible/README.md), run from Ross's PC. The only thing done by hand is writing Raspberry Pi OS to the SD card. A dead card means doing this runbook again from step 2.

Each run brings the Pi up to date with the scripts, so it's safe to run again at any time. So far the scripts set up the basics (security updates that install themselves, SSH by key only, a firewall, UK time and Node.js 24) and install the Hub, which then keeps itself up to date from GitHub releases. Personal settings and secrets, the full-screen browser and Sleep follow in later changes, so until then the Hub shows sample data, and only to the Pi itself.

## What you need

- A Raspberry Pi 5 with the official 27W USB-C power supply and the Active Cooler.
- A 32GB or larger A2 microSD card, and a way to plug it into the PC.
- A screen with a micro-HDMI cable, for checking the first boot.
- Ubuntu in WSL on the PC.

## 1. Get the PC ready (once)

In Ubuntu (WSL):

1. Install Python's venv: `sudo apt update && sudo apt install -y python3-venv`.
2. Make an SSH key for the Pi, if there isn't one already: `ssh-keygen -t ed25519 -C familyhub`. Keep `~/.ssh/id_ed25519` safe. It's the only way into the Pi, and rebuilding with the same key saves a step.
3. Install Ansible, the same version CI uses:

   ```
   python3 -m venv ~/.venvs/familyhub-ansible
   ~/.venvs/familyhub-ansible/bin/pip install -r /mnt/c/git/FamilyHub/ansible/requirements.txt
   ~/.venvs/familyhub-ansible/bin/ansible-galaxy collection install -r /mnt/c/git/FamilyHub/ansible/requirements.yml
   ```

4. Add these lines to `~/.bashrc`, then open a new terminal:

   ```
   source ~/.venvs/familyhub-ansible/bin/activate
   # Windows folders look world-writable to Linux, so Ansible ignores ansible.cfg there unless told where it is.
   export ANSIBLE_CONFIG=/mnt/c/git/FamilyHub/ansible/ansible.cfg
   ```

## 2. Write Raspberry Pi OS to the card

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on Windows. Imager's screens change from time to time, so a label may not match exactly.

1. **Device:** Raspberry Pi 5. **OS:** Raspberry Pi OS (other) → **Raspberry Pi OS Lite (64-bit)**. **Storage:** the SD card.
2. Choose to customise the settings:
   - **Hostname:** `familyhub`
   - **Username:** `hubadmin`, with a long password kept in the password manager. The scripts ask for it each run, because Raspberry Pi OS needs it for `sudo`. It's also the way in at the Pi's own keyboard if SSH ever breaks.
   - **Wi-Fi:** the home network, country GB. Skip this if the Pi will use Ethernet.
   - **Locale:** Europe/London, keyboard `gb`.
   - **SSH:** on, **public-key authentication only**. Paste in the output of `cat ~/.ssh/id_ed25519.pub` from Ubuntu.
   - **Raspberry Pi Connect:** off. Nothing outside the house reaches the Hub ([ADR 0002](../adr/0002-everything-runs-on-the-pi.md)).
3. Write the card, put it in the Pi, connect the screen, and power it on. The first boot takes a few minutes and restarts once.

## 3. Find the Pi

1. In the router's admin page, find `familyhub` and reserve its address so it never changes.
2. WSL can't look up `familyhub.local`, so tell Ansible the address. Add this to `~/.bashrc` too:

   ```
   export FAMILYHUB_PI_HOST=192.168.1.50   # the address you reserved
   ```

3. Check you can get in: `ssh hubadmin@$FAMILYHUB_PI_HOST`, accept the fingerprint, then `exit`.

## 4. Run the scripts

```
cd /mnt/c/git/FamilyHub/ansible
ansible-playbook site.yml -K
```

`-K` asks for `hubadmin`'s password first (`BECOME password:`), because the scripts use `sudo` and Raspberry Pi OS asks for it. Nothing appears as you type or paste it. In the WSL terminal, paste with right-click or Ctrl+Shift+V, not Ctrl+V.

The first run takes about ten minutes, most of it spent on updates. At the end, `failed=0` means it worked. Run it again and it should say `changed=0`.

After this, the Pi:

- only lets you in over SSH with the key: no passwords, and never as root,
- turns away anything else that comes in, using `ufw`,
- installs Debian's security updates and all of Raspberry Pi's and Node.js 24's updates by itself, and restarts at 03:30, while the Hub is asleep, when an update needs it,
- runs the newest release of the Hub, checks for a newer one every 5 minutes, and switches back if a new one doesn't answer its health check,
- restarts the Hub if it crashes, or stops answering for three minutes.

Check the Hub is running:

```
ssh hubadmin@$FAMILYHUB_PI_HOST curl -s localhost:3000/api/health
```

It answers `{"status":"ok","version":"…"}` with the newest release's version.

## Looking after the Hub

- **What it's been doing:** `ssh hubadmin@$FAMILYHUB_PI_HOST journalctl -u familyhub -u familyhub-update -u familyhub-watchdog --since today`
- **Install a new release now, rather than within 5 minutes:** `ssh -t hubadmin@$FAMILYHUB_PI_HOST sudo systemctl start familyhub-update`. The `-t` lets `sudo` ask for the password.
- **A release was rolled back:** the journal says why. The updater won't try that version again, and installs the next release as normal. Once you've found the cause, fix it and merge, and the fix is the next release.
- **Go back to an earlier release by hand:** the last three are in `/opt/familyhub/releases/`. First pause the updater, or it puts the newest release back within 5 minutes: `sudo systemctl stop familyhub-update.timer`. Then point the link at the release you want and restart, for example `sudo ln -sfn releases/2026.11.13.60 /opt/familyhub/current && sudo systemctl restart familyhub`. The pause lasts until the Pi next restarts or you run `sudo systemctl start familyhub-update.timer`.

## Changing the scripts

Test a change on the PC before running it on the Pi. With Docker running, from Git Bash or Ubuntu:

```
ansible/tests/run.sh
```

It lints the scripts, runs them twice in a Debian container standing in for the Pi, checks that the second run changed nothing, and then checks the result. CI runs the same script on every pull request.

## When something goes wrong

- **`Permission denied (publickey)`:** the card was written with a different key. Write it again with the key from step 1.
- **`WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED`** after rewriting the card: that's expected. Run `ssh-keygen -R $FAMILYHUB_PI_HOST`, then step 3.3 again.
- **`No inventory was parsed`:** `ANSIBLE_CONFIG` isn't set in this terminal. See step 1.4.
- **`Command 'ansible-playbook' not found`:** this terminal was opened before the lines were added to `~/.bashrc`. Run `source ~/.bashrc`, or open a new terminal.
- **`Missing sudo password`:** the `-K` was left off. See step 4.
- **`Incorrect sudo password`:** check it outside Ansible with `ssh -t hubadmin@$FAMILYHUB_PI_HOST sudo -v`. If it's right, that prints nothing and closes; if it's wrong, it says `Sorry, try again`. If no password works, write the card again (step 2) with one copied straight from the password manager.

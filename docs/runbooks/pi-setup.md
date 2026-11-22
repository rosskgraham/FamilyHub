# Set up the Pi

The Hub's Pi is built entirely by the Ansible scripts in [`ansible/`](../../ansible/README.md), run from Ross's PC. The only thing done by hand is writing Raspberry Pi OS to the SD card. A dead card means doing this runbook again from step 2.

Each run brings the Pi up to date with the scripts, so it's safe to run again at any time. So far the scripts set up the basics (security updates that install themselves, SSH by key only, a firewall, UK time and Node.js 24), install the Hub, which then keeps itself up to date from GitHub releases, and show it full-screen on the Pi's screen ([ADR 0009](../adr/0009-kiosk-is-chromium-in-cage.md)). Personal settings and secrets, and Sleep, follow in later changes, so until then the Hub shows sample data. Typing a Shopping item or To-do at the Pi needs a USB keyboard until the Hub's own on-screen keyboard arrives.

## What you need

- A Raspberry Pi 5 with the official 27W USB-C power supply and the Active Cooler.
- A 32GB or larger A2 microSD card, and a way to plug it into the PC.
- A screen with a micro-HDMI cable, in the HDMI port next to the power socket. Until the touchscreen arrives, any HDMI screen shows the Hub.
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
   - **Wi-Fi:** skip it. The Pi starts on its network cable, and the scripts give it the Wi-Fi from the Key Vault (step 5), so it stays on the network if the cable comes out.
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

The scripts also copy the Hub's secrets and settings from the Key Vault, which needs step 5's setup on the PC. Until that's done, leave that part out by adding `--skip-tags config`, and the Hub shows sample data.

The first run takes about ten minutes, most of it spent on updates. At the end, `failed=0` means it worked. Run it again and it should say `changed=0`.

After this, the Pi:

- only lets you in over SSH with the key: no passwords, and never as root,
- turns away anything else that comes in, using `ufw`,
- installs Debian's security updates and all of Raspberry Pi's and Node.js 24's updates by itself, and restarts at 03:30, while the Hub is asleep, when an update needs it,
- runs the newest release of the Hub, checks for a newer one every 5 minutes, and switches back if a new one doesn't answer its health check,
- restarts the Hub if it crashes, or stops answering for three minutes,
- shows the Hub full-screen on the screen whenever it starts, with no desktop behind it and no login prompt, and opens it again if the browser closes.

The screen shows the Hub within a minute of the run finishing. Check the Hub is running:

```
ssh hubadmin@$FAMILYHUB_PI_HOST curl -s localhost:3000/api/health
```

It answers `{"status":"ok","version":"…"}` with the newest release's version.

## 5. Give the Hub its secrets

The Google, Octopus and Zappi secrets, the Nest's Device Access project ID, home's location and the home Wi-Fi (`wifi-ssid` and `wifi-password`) are kept in the Key Vault ([ADR 0008](../adr/0008-azure-resources-from-bicep-through-azure-devops.md)), never in the repo. Each run of the scripts reads them on the PC and writes them into `/etc/familyhub/hub.env` on the Pi, which only root can read, and gives the Pi the Wi-Fi, which it uses whenever its network cable is out. Whatever isn't in the vault is left out, and the Hub shows sample data for it. The run says which vault it read and what it left out. The Household is set up afterwards in Settings at the Hub, and kept in its own database ([ADR 0012](../adr/0012-household-and-settings-in-the-hub-database.md)).

1. Set up Azure and put the secrets in the Key Vault, following [the Azure runbook](azure-setup.md), steps 1 to 3.
2. Install the Azure CLI in Ubuntu (WSL), then sign in as the person who can read the secrets:

   ```
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   az login
   ```

   The sign-in lasts about three months. When it runs out, the scripts stop and say to run `az login` again.
3. Run the scripts as in step 4, without `--skip-tags config`. To update only the secrets and settings, after changing them in the vault, add `--tags config` instead: it takes a few seconds.

The scripts find the vault in `rg-familyhub`, in the `FamilyHub` subscription, by themselves, whichever subscription the Azure CLI uses by default. If there's ever more than one vault, set `FAMILYHUB_KEY_VAULT` to its name. If the subscription is ever renamed, set `FAMILYHUB_AZURE_SUBSCRIPTION`.

### Sign the Hub in to Google

The Pi signs in to Google once, and keeps the sign-in in `/var/lib/familyhub`.

1. In Google Cloud, add the Pi's sign-in address to the Hub's client, as in [the Google Cloud runbook](google-cloud-setup.md), step 4: `http://localhost:3000/auth/google/callback`.
2. The Hub only listens on the Pi itself, so reach it from the PC through SSH. In Ubuntu, leave this running:

   ```
   ssh -N -L 3000:localhost:3000 hubadmin@$FAMILYHUB_PI_HOST
   ```

3. In the PC's browser, open <http://localhost:3000/settings>, hold **Hold to change** under Household and Google, and sign in with the Household's Google account. Add the Members there too, with their colours and Calendars, if the Hub has none yet. The Hub on the wall picks it up within a minute.
4. Stop the SSH command with Ctrl+C.

## Looking after the Hub

- **What it's been doing:** `ssh hubadmin@$FAMILYHUB_PI_HOST journalctl -u familyhub -u familyhub-update -u familyhub-watchdog -u familyhub-kiosk --since today`
- **Start the screen again**, for example if it's showing something odd: `ssh -t hubadmin@$FAMILYHUB_PI_HOST sudo systemctl restart familyhub-kiosk`. It opens the Hub again with a fresh browser.
- **Use the Pi's own keyboard:** Ctrl+Alt+F2 gives a login prompt for `hubadmin`, and Ctrl+Alt+F1 goes back to the Hub.
- **Install a new release now, rather than within 5 minutes:** `ssh -t hubadmin@$FAMILYHUB_PI_HOST sudo systemctl start familyhub-update`. The `-t` lets `sudo` ask for the password.
- **A release was rolled back:** the journal says why. The updater won't try that version again, and installs the next release as normal. Once you've found the cause, fix it and merge, and the fix is the next release.
- **Go back to an earlier release by hand:** the last three are in `/opt/familyhub/releases/`. First pause the updater, or it puts the newest release back within 5 minutes: `sudo systemctl stop familyhub-update.timer`. Then point the link at the release you want and restart, for example `sudo ln -sfn releases/2026.11.13.60 /opt/familyhub/current && sudo systemctl restart familyhub`. The pause lasts until the Pi next restarts or you run `sudo systemctl start familyhub-update.timer`.

## Changing the scripts

Test a change on the PC before running it on the Pi. With Docker running, from Git Bash or Ubuntu:

```
ansible/tests/run.sh
```

It lints the scripts, runs them twice in a Debian container standing in for the Pi, checks that the second run changed nothing, and then checks the result. The container has no screen, so it checks the kiosk is set up and its launcher behaves, but only the Pi shows whether the Hub actually appears. CI runs the same script on every pull request.

## When something goes wrong

- **`Permission denied (publickey)`:** the card was written with a different key. Write it again with the key from step 1.
- **`WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED`** after rewriting the card: that's expected. Run `ssh-keygen -R $FAMILYHUB_PI_HOST`, then step 3.3 again.
- **`No inventory was parsed`:** `ANSIBLE_CONFIG` isn't set in this terminal. See step 1.4.
- **`Command 'ansible-playbook' not found`:** this terminal was opened before the lines were added to `~/.bashrc`. Run `source ~/.bashrc`, or open a new terminal.
- **`Missing sudo password`:** the `-K` was left off. See step 4.
- **`Incorrect sudo password`:** check it outside Ansible with `ssh -t hubadmin@$FAMILYHUB_PI_HOST sudo -v`. If it's right, that prints nothing and closes; if it's wrong, it says `Sorry, try again`. If no password works, write the card again (step 2) with one copied straight from the password manager.
- **The screen stays black, or shows a login prompt:** the kiosk waits for the Hub to answer its health check before opening it, so check that first (step 4). Then see what the kiosk says: `ssh hubadmin@$FAMILYHUB_PI_HOST journalctl -u familyhub-kiosk -b`. Check the screen is in the HDMI port next to the power socket.

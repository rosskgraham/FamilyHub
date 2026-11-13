# Set up the Pi

The Hub's Pi is built entirely by the Ansible scripts in [`ansible/`](../../ansible/README.md), run from Alex's PC. The only thing done by hand is writing Raspberry Pi OS to the SD card. A dead card means doing this runbook again from step 2.

Each run brings the Pi up to date with the scripts, so it's safe to run again at any time. For now the scripts set up the basics: security updates that install themselves, SSH by key only, a firewall, UK time, Node.js 24, and the Hub's own user and folders. Installing the Hub, the full-screen browser and Sleep follow in later changes.

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
   - **Username:** `hubadmin`, with a long password kept in the password manager. The scripts don't need it, but it's the way in at the Pi's own keyboard if SSH ever breaks.
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
ansible-playbook site.yml
```

The first run takes about ten minutes, most of it spent on updates. At the end, `failed=0` means it worked. Run it again and it should say `changed=0`.

After this, the Pi:

- only lets you in over SSH with the key: no passwords, and never as root,
- turns away anything else that comes in, using `ufw`,
- installs Debian's security updates and all of Raspberry Pi's and Node.js 24's updates by itself, and restarts at 03:30, while the Hub is asleep, when an update needs it.

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

# A stand-in for the Pi: Debian 13, which Raspberry Pi OS is built on, running systemd,
# with the same Ansible the PC uses.
FROM debian:trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd systemd-sysv python3 python3-venv git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements.yml /tmp/
RUN python3 -m venv /opt/ansible \
 && /opt/ansible/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
 && /opt/ansible/bin/ansible-galaxy collection install -r /tmp/requirements.yml -p /usr/share/ansible/collections
ENV PATH=/opt/ansible/bin:$PATH
COPY . /ansible
WORKDIR /ansible
CMD ["/sbin/init"]

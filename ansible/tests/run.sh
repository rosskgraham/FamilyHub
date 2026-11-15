#!/usr/bin/env bash
# Lints the setup scripts, runs them twice in a container standing in for the Pi (the second run must
# change nothing), then checks the result. Needs Docker. Works in Git Bash, WSL and CI.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # stop Git Bash rewriting the container paths below

cd "$(dirname "$0")/.."
image=familyhub-ansible-test
name="familyhub-ansible-test-$$"

docker build --quiet --tag "$image" --file tests/Dockerfile . >/dev/null
docker run --detach --name "$name" --privileged --cgroupns=host \
  --volume /sys/fs/cgroup:/sys/fs/cgroup:rw "$image" >/dev/null
trap 'docker rm --force "$name" >/dev/null' EXIT
in_pi() { docker exec "$name" "$@"; }

echo "Waiting for systemd"
in_pi sh -c 'until systemctl is-system-running 2>/dev/null | grep -qE "running|degraded"; do sleep 1; done'

echo "Linting"
in_pi ansible-lint

echo "First run"
in_pi ansible-playbook -i tests/inventory.yml site.yml

echo "Second run, which must change nothing"
second=$(in_pi ansible-playbook -i tests/inventory.yml site.yml)
echo "$second"
if ! grep -Eq 'changed=0 +unreachable=0 +failed=0' <<<"$second"; then
  echo "The second run changed something, so the scripts aren't safe to run again." >&2
  exit 1
fi

echo "Checking the result"
in_pi ansible-playbook -i tests/inventory.yml tests/verify.yml

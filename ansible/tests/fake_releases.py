"""A stand-in for GitHub's releases, for the tests.

    python3 fake_releases.py VERSION [--broken | --tampered]

packages a pretend Hub release into /srv/releases and makes it the latest, the way GitHub's
releases/latest API answers. Serve the folder with `python3 -m http.server 8080`. A --broken release
exits as soon as it starts, and a --tampered one doesn't match its checksum.
"""

import hashlib
import io
import json
import pathlib
import sys
import tarfile

ROOT = pathlib.Path("/srv/releases")
BASE = "http://127.0.0.1:8080"

# Answers every request the way the real Hub answers /api/health.
WORKING = """import http from 'node:http';
http
\t.createServer((req, res) => {{
\t\tres.setHeader('content-type', 'application/json');
\t\tres.end(JSON.stringify({{ status: 'ok', version: '{version}' }}));
\t}})
\t.listen(Number(process.env.PORT), process.env.HOST);
"""
BROKEN = "process.exit(1);\n"


def add(tar, name, text):
    data = text.encode()
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o644
    tar.addfile(info, io.BytesIO(data))


def publish(version, broken=False, tampered=False):
    ROOT.mkdir(parents=True, exist_ok=True)
    name = f"familyhub-{version}"
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        add(tar, f"{name}/package.json", json.dumps({"name": "familyhub", "version": version, "type": "module"}))
        add(tar, f"{name}/build/index.js", BROKEN if broken else WORKING.format(version=version))
    tarball = buffer.getvalue()
    checksum = hashlib.sha256(b"something else" if tampered else tarball).hexdigest()

    (ROOT / f"{name}.tar.gz").write_bytes(tarball)
    (ROOT / f"{name}.tar.gz.sha256").write_text(f"{checksum}  {name}.tar.gz\n")
    assets = [{"name": n, "browser_download_url": f"{BASE}/{n}"} for n in (f"{name}.tar.gz", f"{name}.tar.gz.sha256")]
    (ROOT / "latest").write_text(json.dumps({"tag_name": f"v{version}", "assets": assets}))


if __name__ == "__main__":
    publish(sys.argv[1], broken="--broken" in sys.argv, tampered="--tampered" in sys.argv)

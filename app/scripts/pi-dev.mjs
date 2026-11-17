// Shows the PC's dev server on the Pi's screen, so a saved change appears on the wall straight away, with
// no release. Runs `vite dev`, then opens an SSH session to the Pi that forwards the Pi's localhost:5173
// back to it and points the kiosk there. Ctrl+C (or the connection dropping) points the kiosk back at the
// Hub; so does restarting the Pi, as the change lives in /run. The Hub itself keeps running throughout.
//
// Needs the Pi's SSH key on the PC, and asks for hubadmin's sudo password. The Pi is FAMILYHUB_PI_HOST,
// or familyhub.local, as in ansible/inventory.yml.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 5173;
const host = process.env.FAMILYHUB_PI_HOST || 'familyhub.local';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Runs on the Pi as root. The kiosk's launcher waits for /api/health, which comes through the tunnel.
const onPi = `
set -u
dir=/run/systemd/system/familyhub-kiosk.service.d
point_at() {
  systemctl daemon-reload
  systemctl restart familyhub-kiosk
  echo "The Pi's screen is showing $1."
}
put_back() {
  trap - EXIT INT TERM HUP
  kill "\${sleeper:-}" 2>/dev/null
  rm -rf "$dir"
  point_at "the Hub again"
  exit 0
}
trap put_back EXIT INT TERM HUP
mkdir -p "$dir"
printf '[Service]\\nEnvironment=FAMILYHUB_URL=http://localhost:${port}\\n' > "$dir/dev.conf"
point_at "this PC's dev server. Ctrl+C puts the Hub back"
sleep infinity & sleeper=$!
wait
`;
const encoded = Buffer.from(onPi).toString('base64');

// Vite gets no keyboard, so its shortcuts don't fight SSH's password prompt and Ctrl+C.
const vite = spawn(
	process.execPath,
	[resolve(app, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'],
	{ cwd: app, stdio: ['ignore', 'inherit', 'inherit'] }
);
vite.on('exit', (code) => {
	console.error(`vite stopped (${code}).`);
	process.exit(code ?? 1);
});

// The SSH session starts once vite answers, so its password prompt isn't lost in vite's start-up.
const deadline = Date.now() + 60_000;
while (!(await answers())) {
	if (Date.now() > deadline) stop('vite never answered on localhost:' + port);
	await new Promise((r) => setTimeout(r, 500));
}

// -t gives sudo a prompt, and passes Ctrl+C to the Pi, where it puts the Hub back before SSH closes.
const ssh = spawn(
	'ssh',
	[
		'-t',
		'-o',
		'ExitOnForwardFailure=yes',
		'-o',
		'ServerAliveInterval=15',
		'-R',
		`${port}:localhost:${port}`,
		`hubadmin@${host}`,
		`sudo bash -c "$(echo ${encoded} | base64 -d)"`
	],
	{ stdio: 'inherit' }
);
ssh.on('exit', (code) => stop(code ? `ssh stopped (${code}).` : undefined, code ?? 1));
// SSH takes Ctrl+C itself; this is for when it reaches us anyway, so vite never outlives it.
process.on('SIGINT', () => {});

async function answers() {
	try {
		return (await fetch(`http://localhost:${port}/api/health`)).ok;
	} catch {
		return false;
	}
}

function stop(message, code = 1) {
	if (message) console.error(message);
	vite.removeAllListeners('exit');
	vite.kill();
	process.exit(message ? code : 0);
}

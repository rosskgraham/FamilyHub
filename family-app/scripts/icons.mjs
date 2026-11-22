// Makes the app's home-screen icons from the FamilyHub logo (static/logo.svg, a copy of site/logo.svg). Run with
// `npm run icons` after changing the logo, and commit the results. The logo's house sits inside the middle 80%, the
// part of a maskable icon Android never crops, so the same picture serves as both kinds.
import sharp from 'sharp';

const logo = new URL('../static/logo.svg', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = (name) => new URL(`../static/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

for (const [name, size] of [
	['icon-192.png', 192],
	['icon-512.png', 512],
	['maskable-512.png', 512]
]) {
	await sharp(logo, { density: 600 }).resize(size, size).png().toFile(out(name));
	console.log(`static/icons/${name}`);
}

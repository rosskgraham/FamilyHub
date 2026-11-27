import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// site/logo.svg is the one FamilyHub logo; the phone app keeps a copy, and makes its home-screen icons from it (AB#95).
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test("the phone app's logo is a copy of site/logo.svg", () => {
	expect(read('../../static/logo.svg')).toBe(read('../../../site/logo.svg'));
});

// Renders the design tool's .dc.html mockups to standalone HTML in ./html.
// Usage: node design/mockups/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'html');
const canvas = JSON.parse(readFileSync(join(here, 'canvas.json'), 'utf8'));

const evaluate = (expr, scope) =>
  new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));

const interpolate = (text, scope) =>
  text.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => String(evaluate(expr.trim(), scope) ?? ''));

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1].replace(/^\{\{\s*|\s*\}\}$/g, '') : null;
};

// Finds the close tag matching the open tag at `start`, allowing nesting.
function findClose(src, name, start) {
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(src)); ) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return m.index;
  }
  throw new Error(`Unclosed <${name}>`);
}

function render(src, scope) {
  let out = '';
  let pos = 0;
  const re = /<(sc-for|sc-if)\b[^>]*>/g;
  for (let m; (m = re.exec(src)); ) {
    const name = m[1];
    const bodyStart = m.index + m[0].length;
    const close = findClose(src, name, m.index);
    const body = src.slice(bodyStart, close);
    out += interpolate(src.slice(pos, m.index), scope);
    if (name === 'sc-for') {
      const as = attr(m[0], 'as');
      for (const item of evaluate(attr(m[0], 'list'), scope) ?? []) {
        out += render(body, { ...scope, [as]: item });
      }
    } else if (evaluate(attr(m[0], 'value'), scope)) {
      out += render(body, scope);
    }
    pos = close + `</${name}>`.length;
    re.lastIndex = pos;
  }
  return out + interpolate(src.slice(pos), scope);
}

function renderVals(src) {
  const script = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  const ctx = vm.createContext({});
  vm.runInContext(`class DCLogic {}\n${script}\nthis.vals = new Component().renderVals();`, ctx);
  return ctx.vals;
}

function build(file, title) {
  const src = readFileSync(join(here, file), 'utf8');
  const helmet = src.match(/<helmet>([\s\S]*?)<\/helmet>/)[1].trim();
  const body = src.match(/<\/helmet>([\s\S]*?)<\/x-dc>/)[1].trim();
  const html = render(body, renderVals(src));
  const bg = html.match(/background: (#[0-9A-Fa-f]{6})/)[1];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${helmet}
<style>
html, body { height: 100%; overflow: hidden; background: ${bg}; }
#stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
</style>
</head>
<body>
<div id="stage">
${html}
</div>
<script>
// Scale the 1920×1080 screen to fit the window. Add ?actual to view at 100%.
const stage = document.getElementById('stage');
function fit() {
  if (location.search.includes('actual')) { document.documentElement.style.overflow = document.body.style.overflow = 'auto'; return; }
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = 'translate(' + (innerWidth - 1920 * s) / 2 + 'px,' + (innerHeight - 1080 * s) / 2 + 'px) scale(' + s + ')';
}
addEventListener('resize', fit);
fit();
</script>
</body>
</html>
`;
}

mkdirSync(outDir, { recursive: true });
const cards = [];
for (const file of canvas.order) {
  const title = canvas.boards[file].title;
  const outName = file.replace('.dc.html', '.html');
  writeFileSync(join(outDir, outName), build(file, title));
  cards.push(`<a href="${outName}"><div class="frame"><iframe src="${outName}" tabindex="-1" loading="lazy"></iframe></div><span>${title}</span></a>`);
  console.log(`html/${outName}`);
}

writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${canvas.title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap">
<style>
body { margin: 0; padding: 32px 16px; background: #F3F5F8; color: #161B22; font-family: 'Figtree', system-ui, sans-serif; }
main { max-width: 1400px; margin: 0 auto; }
h1 { font-size: 32px; margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 24px; }
a { color: inherit; text-decoration: none; font-weight: 600; font-size: 18px; display: flex; flex-direction: column; gap: 10px; }
.frame { aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
a:hover .frame { box-shadow: 0 0 0 3px #161B22; }
iframe { width: 100%; height: 100%; border: 0; pointer-events: none; }
</style>
</head>
<body>
<main>
<h1>${canvas.title}</h1>
<div class="grid">
${cards.join('\n')}
</div>
</main>
</body>
</html>
`);
console.log('html/index.html');

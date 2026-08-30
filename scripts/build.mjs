import { mkdir, readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const og = await readFile(new URL('../public/og.png', import.meta.url));
const runtime = await readFile(new URL('../worker/runtime.js', import.meta.url), 'utf8');
const hosting = await readFile(new URL('../.openai/hosting.json', import.meta.url), 'utf8');

const assets = `const assets = {
  '/': { body: ${JSON.stringify(html)}, type: 'text/html; charset=utf-8' },
  '/index.html': { body: ${JSON.stringify(html)}, type: 'text/html; charset=utf-8' },
  '/styles.css': { body: ${JSON.stringify(css)}, type: 'text/css; charset=utf-8' },
  '/app.js': { body: ${JSON.stringify(js)}, type: 'text/javascript; charset=utf-8' },
  '/og.png': { body: ${JSON.stringify(og.toString('base64'))}, type: 'image/png', binary: true },
};\n`;

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await mkdir(new URL('../dist/.openai/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), assets + runtime);
await writeFile(new URL('../dist/.openai/hosting.json', import.meta.url), hosting);
console.log('Nexo Flow build concluído: dist/server/index.js');

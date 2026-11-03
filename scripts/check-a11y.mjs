import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve('dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = path.join(ROOT, url);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  if (!fs.existsSync(file)) { response.writeHead(404); response.end('not found'); return; }
  response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(4399, '127.0.0.1', resolve));
const routes = ['/', '/now/', '/writing/', '/projects/', '/links/', '/about/', '/writing/syntaxflow-csharp-modes/'];
function chromiumPath() {
  const candidates = [process.env.CHROME_PATH, chromium.executablePath()].filter(Boolean);
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse()) {
      candidates.push(path.join(cache, dir, 'chrome-linux64/chrome'), path.join(cache, dir, 'chrome-linux/chrome'));
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}
const browser = await chromium.launch({ executablePath: chromiumPath() });
const axePath = path.resolve('node_modules/axe-core/axe.min.js');
const problems = [];
let checked = 0;

for (const width of [1440, 390]) {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:4399${route}`, { waitUntil: 'load' });
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
    for (const violation of result.violations) problems.push(`${route} @${width}: ${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target?.join(' ')}`);
    for (const error of errors) problems.push(`${route} @${width}: script error ${error}`);
    checked += 1;
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`Accessibility and script checks: ${checked} page/viewport pairs.`);
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'No WCAG A/AA violations and no script errors.');
process.exit(problems.length ? 1 : 0);

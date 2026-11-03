import fs from 'node:fs';
import path from 'node:path';
import { documents, articles } from '../src/lib/content.mjs';

const ROOT = path.resolve('dist');
const problems = [];
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.html')) htmlFiles.push(target);
  }
}
walk(ROOT);

function exists(urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const target = path.join(ROOT, clean);
  if (clean.endsWith('/')) return fs.existsSync(path.join(target, 'index.html'));
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) return fs.existsSync(path.join(target, 'index.html'));
  return fs.existsSync(target);
}

let links = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:)/i.test(href)) continue;
    if (!href.startsWith('/')) continue;
    links += 1;
    if (!exists(href)) problems.push(`${path.relative(ROOT, file)} → ${href}`);
  }
}

// Every legacy Markdown document keeps its permalink and its old .html alias.
for (const doc of documents) {
  const canonical = path.join(ROOT, doc.url, 'index.html');
  if (!fs.existsSync(canonical)) problems.push(`missing canonical page ${doc.url}`);
  const alias = path.join(ROOT, doc.relative.replace(/\.md$/, '.html'));
  if (!fs.existsSync(alias)) problems.push(`missing legacy alias ${doc.relative.replace(/\.md$/, '.html')}`);
}
for (const article of articles) {
  if (!fs.existsSync(path.join(ROOT, article.url, 'index.html'))) problems.push(`missing article ${article.url}`);
}
for (const required of ['rss.xml', 'feed.xml', 'search-index.json', '.nojekyll', 'sitemap.xml']) {
  if (!fs.existsSync(path.join(ROOT, required))) problems.push(`missing ${required}`);
}
for (const legacy of ['archives', 'categories', 'tags']) {
  if (!fs.existsSync(path.join(ROOT, legacy, 'index.html'))) problems.push(`missing legacy redirect /${legacy}/`);
}

const unique = [...new Set(problems)];
console.log(`Checked ${htmlFiles.length} HTML pages, ${links} internal links.`);
console.log(unique.length ? `${unique.length} problems:\n${unique.slice(0, 40).join('\n')}` : 'No broken internal links or missing legacy routes.');
process.exit(unique.length ? 1 : 0);

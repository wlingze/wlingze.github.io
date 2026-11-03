import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { documents, articles, friends, renderDocument } from '../src/lib/content.mjs';
import { addComment, listComments, resolveComment } from '../src/lib/comments-store.mjs';

const publicDir = path.resolve('docs/.vuepress/public');

test('every document has a title, a valid date and a unique URL', () => {
  assert.ok(documents.length >= 98, `expected at least 98 documents, found ${documents.length}`);
  const urls = new Set();
  for (const doc of documents) {
    assert.ok(doc.title && doc.title.trim(), `missing title: ${doc.relative}`);
    assert.ok(doc.date && !Number.isNaN(Date.parse(doc.date)), `invalid date: ${doc.relative}`);
    assert.ok(!urls.has(doc.url), `duplicate URL ${doc.url}`);
    urls.add(doc.url);
  }
});

test('imported Feishu articles state their source and date basis', () => {
  const imported = documents.filter((doc) => doc.relative.startsWith('published/'));
  assert.equal(imported.length, 14);
  for (const doc of imported) {
    assert.match(doc.source, /^https:\/\/feishu-4dogs\.feishu\.cn\/wiki\//);
    assert.equal(doc.dateBasis, 'source-created');
    assert.equal(doc.publicationDateVerified, false);
    assert.doesNotMatch(doc.content, /feishu\.cn\/file\//, `unlocalized image in ${doc.relative}`);
    assert.doesNotMatch(doc.content, /<whiteboard|<sheet|<bitable/, `unhandled block in ${doc.relative}`);
  }
});

test('every local image referenced by a document exists', () => {
  for (const doc of documents) {
    for (const match of doc.content.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)\)/g)) {
      // Old Typora exports point at the author's machine; the renderer replaces
      // those with a visible note instead of shipping a broken image.
      if (match[1].startsWith('/Users/')) continue;
      const file = path.join(publicDir, decodeURIComponent(match[1]));
      assert.ok(fs.existsSync(file), `missing image ${match[1]} in ${doc.relative}`);
    }
  }
});

test('GitHub data excludes private or company-private repositories', () => {
  const data = JSON.parse(fs.readFileSync('src/data/github.json', 'utf8'));
  assert.ok(data.projects.length >= 6);
  for (const project of data.projects) {
    assert.notEqual(project.repository, 'VillanCh/legion');
    assert.ok(['work', 'contribution', 'personal'].includes(project.group));
  }
  for (const item of data.activity) {
    assert.ok(!item.repository.startsWith('VillanCh/'));
    assert.match(item.url, /\/pull\/\d+$/, 'activity must be pull requests, not commits');
  }
});

test('legacy titles were made descriptive without touching permalinks', () => {
  const weak = articles.filter((article) => /^(lab\d|ucore_lab\d|Q1|AFL|readme|challenge0|week\d)$/.test(article.title));
  assert.deepEqual(weak.map((article) => article.title), []);
  const map = JSON.parse(fs.readFileSync('.hallmark/title-map.json', 'utf8'));
  assert.ok(map.changes.length >= 90);
});

test('GitHub activity includes a contribution calendar and eCapture', () => {
  const data = JSON.parse(fs.readFileSync('src/data/github.json', 'utf8'));
  assert.ok(data.contributions.days.length >= 360);
  assert.ok(data.contributions.total > 0);
  assert.ok(data.projects.some((project) => project.repository === 'gojue/ecapture'));
  assert.ok(data.projects.some((project) => project.repository === 'wlingze/golang_rev'));
  assert.equal(data.profile.twitter, 'wlingze');
});

test('friend links parsed from the Markdown card list', () => {
  assert.ok(friends.length >= 15);
  for (const friend of friends) {
    assert.ok(friend.name);
    if (friend.link) assert.match(friend.link, /^https?:\/\//);
  }
});

test('review comments are development only and keep source positions', () => {
  const base = fs.readFileSync('src/layouts/Base.astro', 'utf8');
  assert.match(base, /import\.meta\.env\.DEV/);
  assert.match(base, /dev-comments\.js\?raw/);
  assert.match(fs.readFileSync('scripts/dev-comments.mjs', 'utf8'), /__dev-comments/);
  const about = documents.find((doc) => doc.relative === 'about.md');
  assert.equal(about.lineOffset, 6);
  assert.doesNotMatch(renderDocument(about).html, /data-dev-(?:file|line)/);
});

test('comment store adds, filters and resolves entries', () => {
  const store = path.join(os.tmpdir(), `blog-comments-${process.pid}.json`);
  const entry = addComment({ page: '/about/', quote: '令则，常用 ID 是 wlingze。', comment: '拆成两句', sourceFile: 'docs/about.md', sourceLine: 8 }, store);
  assert.equal(entry.id, 1);
  assert.equal(entry.status, 'open');
  assert.equal(listComments({ store }).length, 1);
  assert.equal(listComments({ store, page: '/' }).length, 0);
  assert.equal(resolveComment(1, 'done', store).status, 'resolved');
  assert.equal(listComments({ store }).length, 0);
  assert.equal(listComments({ store, includeResolved: true }).length, 1);
  fs.rmSync(store);
});

test('contact email is either empty or a mail address, and never leaks a token', () => {
  const contact = JSON.parse(fs.readFileSync('src/data/contact.json', 'utf8'));
  assert.equal(typeof contact.email, 'string');
  if (contact.email) assert.match(contact.email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  const about = documents.find((doc) => doc.relative === 'about.md');
  const html = renderDocument(about).html;
  assert.doesNotMatch(html, /\{\{EMAIL/, 'the email token must be replaced before rendering');
  assert.match(html, contact.email ? /href="mailto:/ : /邮箱地址暂不公开/);
});

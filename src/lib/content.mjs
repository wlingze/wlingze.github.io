import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';
import { full as emoji } from 'markdown-it-emoji';
import { createHighlighter, createCssVariablesTheme } from 'shiki';
import { email as contactEmail } from './contact.mjs';

const ROOT = path.resolve('docs');
const media = JSON.parse(fs.readFileSync('src/data/media.json', 'utf8'));
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slugify = (s) => String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~，。！？：；、“”‘’（）【】]/g, '');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : target.endsWith('.md') ? [target] : [];
  });
}

export function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).replace(/^['"]|['"]$/g, '').trim();
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw) ? `${raw.replace(' ', 'T')}+08:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function formatDate(value, options = {}) {
  if (!value) return '日期未记录';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...options }).format(new Date(value));
}
export const day = (value) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '';
export const stamp = (value) => day(value) ? day(value).replaceAll('-', '.') : '未记录';
export function plainText(content) {
  return content.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]*>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*`>|_~]/g, '').replace(/\[\[toc\]\]/gi, '').replace(/\s+/g, ' ').trim();
}
// Markdown line numbers only line up with the source file when the renderer
// keeps every template's line count. The replacements below pad with newlines
// for that reason; the dev picker depends on it.
const DEV = Boolean(import.meta.env && import.meta.env.DEV);
const keepLineCount = (matched, replacement) => {
  const removed = (matched.match(/\n/g) || []).length - (replacement.match(/\n/g) || []).length;
  return removed > 0 ? replacement + '\n'.repeat(removed) : replacement;
};
export const documents = walk(ROOT).filter((file) => !file.includes('/@pages/') && path.basename(file) !== 'index.md' && path.basename(file) !== 'friends.md').map((file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  const frontmatter = raw.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  const lineOffset = frontmatter ? (frontmatter[0].match(/\n/g) || []).length : 0;
  const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const dateRaw = raw.match(/^date:\s*(.+)$/m)?.[1];
  const title = String(data.title || path.basename(file, '.md'));
  const canonical = data.permalink || `/${relative.replace(/\.md$/, '').replace(/(?:^|\/)README$/i, '')}/`;
  const categories = (Array.isArray(data.categories) ? data.categories : []).filter(Boolean).map(String);
  const tags = (Array.isArray(data.tags) ? data.tags : []).filter(Boolean).map(String);
  const text = plainText(content);
  const url = canonical.replace(/\/+/g, '/');
  return { ...data, title, file, relative, content, lineOffset, url: url.endsWith('/') ? url : `${url}/`, date: normalizeDate(dateRaw), categories, tags, excerpt: data.description || text.slice(0, 112), text, readingTime: Math.max(1, Math.ceil(text.length / 450)), article: data.article !== false };
});
export const friends = (() => {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'friends.md'), 'utf8');
    const block = raw.match(/```ya?ml\n([\s\S]*?)```/);
    if (!block) return [];
    const yaml = block[1].split('\n').map((line) => `  ${line}`).join('\n');
    const parsed = matter(`---\nitems:\n${yaml}\n---`);
    return (parsed.data.items || []).filter((item) => item && item.name).map((item) => ({ name: String(item.name), desc: item.desc ? String(item.desc) : '', link: item.link ? String(item.link) : null }));
  } catch {
    return [];
  }
})();
export const articles = documents.filter((doc) => doc.article).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
export const getTopics = (field = 'categories') => [...new Set(articles.flatMap((article) => article[field]))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
const byPath = new Map(documents.map((doc) => [doc.relative, doc]));

export function resolveContentLink(href, source) {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return href;
  const [base, hash] = href.split('#');
  if (!base?.endsWith('.md')) return href;
  let decoded;
  try { decoded = decodeURIComponent(base); } catch { return href; }
  const relative = decoded.startsWith('/') ? decoded.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(source.relative), decoded));
  const target = byPath.get(relative);
  return target ? target.url + (hash ? `#${hash}` : '') : href;
}

const languages = ['bash', 'c', 'cpp', 'go', 'java', 'javascript', 'json', 'lua', 'php', 'python', 'rust', 'sql', 'typescript', 'yaml', 'xml', 'csharp', 'diff', 'asm', 'text'];
const highlighter = await createHighlighter({ themes: [createCssVariablesTheme({ name: 'tokens', variablePrefix: '--syntax-' })], langs: languages });
const aliases = { golang: 'go', shell: 'bash', sh: 'bash', zsh: 'bash', yml: 'yaml', js: 'javascript', html: 'xml', 'c++': 'cpp', py: 'python', plaintext: 'text', 'c#': 'csharp', cs: 'csharp', '': 'text' };
const md = new MarkdownIt({ html: true, linkify: true, typographer: false, highlight(code, language) {
  const name = String(language || '').toLowerCase();
  const lang = aliases[name] || name;
  if (!highlighter.getLoadedLanguages().includes(lang)) return `<pre tabindex="0"><code>${escape(code)}</code></pre>`;
  return highlighter.codeToHtml(code, { lang, theme: 'tokens' });
} }).use(anchor, { slugify, tabIndex: false }).use(emoji);
for (const type of ['tip', 'warning', 'danger', 'note', 'center', 'right']) {
  md.use(container, type, { render(tokens, index) {
    if (tokens[index].nesting < 0) return '</aside>\n';
    const label = tokens[index].info.trim().slice(type.length).trim();
    return `<aside class="callout callout-${type}">${label && label !== type ? `<p class="callout-title">${escape(label)}</p>` : ''}\n`;
  } });
}
md.use(container, 'details', { render(tokens, index) {
  if (tokens[index].nesting < 0) return '</details>\n';
  return `<details><summary>${escape(tokens[index].info.trim().slice(7).trim() || '展开完整代码')}</summary>\n`;
} });
const imageRule = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet('src') || '';
  token.attrSet('loading', 'lazy');
  token.attrSet('decoding', 'async');
  if (media[src]) {
    token.attrSet('width', String(media[src].width));
    token.attrSet('height', String(media[src].height));
  }
  // Preserve the raw Markdown, but don't emit a broken local author-machine image.
  if (src.startsWith('/Users/')) return `<span class="missing-media">原文配图未归档</span>`;
  return imageRule(tokens, index, options, env, self);
};
const linkRule = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = token.attrGet('href');
  if (env.document) token.attrSet('href', resolveContentLink(href, env.document));
  if (/^https?:\/\//.test(href || '')) token.attrSet('rel', 'noopener noreferrer');
  return linkRule(tokens, index, options, env, self);
};

function legacyCards(content) {
  return content.replace(/::: ?cardList[^\n]*\n\s*```ya?ml\s*\n([\s\S]*?)```\s*(?:## )?:::/g, (block, yaml) => {
    let cards;
    try { cards = matter(`---\nitems:\n${yaml.split('\n').map((line) => `  ${line}`).join('\n')}\n---`).data.items; } catch { return block; }
    if (!Array.isArray(cards)) return block;
    const list = `<ul class="friend-list">${cards.map((card) => `<li>${card.link && /^https?:\/\//.test(card.link) ? `<a href="${escape(card.link)}" rel="noopener noreferrer">${escape(card.name || card.link)}</a>` : `<strong>${escape(card.name || '')}</strong>`}${card.desc ? `<p>${escape(card.desc)}</p>` : ''}</li>`).join('')}</ul>`;
    return keepLineCount(block, list);
  });
}
export function renderDocument(document) {
  // Legacy VuePress placeholders and empty link labels are build artifacts,
  // not prose. Keep the surrounding sentence and keep the destination.
  let content = legacyCards(document.content)
    .replace(/\{\{EMAIL_[A-Za-z0-9_]+\}\}/g, '（邮箱地址暂不公开）')
    .replace(/\{\{EMAIL\}\}/g, contactEmail ? `<a href="mailto:${escape(contactEmail)}">${escape(contactEmail)}</a>` : '（邮箱地址暂不公开）')
    .replace(/\[\]\((https?:\/\/[^)\s]+)\)/g, (match, href) => {
      try { return `[${new URL(href).hostname}](${href})`; } catch { return match; }
    })
    .replace(/^[ \t]*\[\[toc\]\][ \t]*$/gim, '');
  const env = { document };
  // Drop a leading H1 only when it repeats the title or is the document's
  // only H1. Feishu exports use H1 for sections too, so a first H1 that
  // differs from the title is a section heading and must survive.
  const normalize = (value) => value.replace(/[*_`]/g, '').replace(/\s+/g, '').toLowerCase();
  const leading = content.match(/^\s{0,3}#\s+([^\n]+)\n+/);
  if (leading) {
    const h1s = [...content.matchAll(/^ {0,3}#\s+/gm)];
    const repeated = normalize(leading[1]) === normalize(document.title);
    if (repeated || h1s.length === 1) content = content.replace(/^\s{0,3}#\s+[^\n]+\n+/, (match) => '\n'.repeat((match.match(/\n/g) || []).length));
  }
  const tokens = md.parse(content, env);
  // Dev-only source annotations, consumed by src/lib/dev-picker.js.
  if (DEV && document.file) {
    for (const token of tokens) {
      if (!token.map || token.nesting !== 1) continue;
      if (!/^(paragraph|heading|list_item|blockquote|table)_open$/.test(token.type)) continue;
      token.attrSet('data-dev-file', document.file);
      token.attrSet('data-dev-line', String(document.lineOffset + token.map[0] + 1));
    }
  }
  // Feishu exports use H1 for sections as well as for the title. The layout
  // already owns the page H1, so any remaining H1 becomes H2 and the rest
  // shift down with it. Anchors were generated at parse time and stay stable.
  if (tokens.some((token) => token.type === 'heading_open' && token.tag === 'h1')) {
    for (const token of tokens) {
      if (token.type === 'heading_open' || token.type === 'heading_close') token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 1)}`;
    }
  }
  const headings = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      const level = Number(tokens[i].tag.slice(1));
      const inline = tokens[i + 1];
      const title = inline?.children?.filter((t) => t.type === 'text' || t.type === 'code_inline').map((t) => t.content).join('') || inline?.content || '';
      headings.push({ level, title, id: tokens[i].attrGet('id') });
    }
  }
  return { html: md.renderer.render(tokens, md.options, env), headings };
}

export function searchRecords() {
  return articles.map(({ title, url, date, categories, tags, text }) => ({ title, url, date: day(date), categories, tags, text: text.slice(0, 24000) }));
}

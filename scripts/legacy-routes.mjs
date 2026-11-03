import fs from 'node:fs/promises';
import path from 'node:path';

// VuePress served file-path aliases as .html even when an article had a permalink.
// Astro renders canonical directories; copy tiny redirect documents for old URLs.
export default function legacyRoutes() {
  return {
    name: 'legacy-vuepress-urls',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const { documents } = await import('../src/lib/content.mjs');
        const root = dir.pathname;
        for (const doc of documents) {
          const alias = doc.relative.replace(/\.md$/, '.html');
          const target = path.join(root, alias);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const url = doc.url;
          const escaped = (s) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
          await fs.writeFile(target, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escaped(doc.title)} | 令则</title><link rel="canonical" href="https://wlingze.github.io${encodeURI(url)}"><meta http-equiv="refresh" content="0;url=${escaped(encodeURI(url))}"><meta name="robots" content="noindex"></head><body><p>文章已迁移。<a href="${escaped(encodeURI(url))}">继续阅读 ${escaped(doc.title)}</a></p></body></html>`);
        }
        await fs.copyFile(path.join(root, 'rss.xml'), path.join(root, 'feed.xml'));
        const pages = ['/', '/now/', '/projects/', '/writing/', '/links/', '/about/', ...documents.map((doc) => doc.url)];
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(pages)].map((url) => `  <url><loc>https://wlingze.github.io${encodeURI(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
        await fs.writeFile(path.join(root, 'sitemap.xml'), sitemap);
        // The old theme had dedicated archive, category and tag pages. The new
        // writing index filters all three, so keep those URLs working.
        for (const legacy of ['archives', 'categories', 'tags']) {
          const target = path.join(root, legacy, 'index.html');
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>文章索引 | 令则</title><link rel="canonical" href="https://wlingze.github.io/writing/"><meta http-equiv="refresh" content="0;url=/writing/"><meta name="robots" content="noindex"></head><body><p>归档、分类与标签已合并到<a href="/writing/">文章索引</a>。</p></body></html>`);
        }
        const friendsPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>友链 | 令则</title><link rel="canonical" href="https://wlingze.github.io/links/"><meta http-equiv="refresh" content="0;url=/links/#links-friends"><meta name="robots" content="noindex"></head><body><p>友链已并入<a href="/links/#links-friends">链接</a>。</p></body></html>`;
        for (const legacy of ['friends/index.html', 'friends.html']) {
          const target = path.join(root, legacy);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, friendsPage);
        }
        await fs.writeFile(path.join(root, '.nojekyll'), '');
      },
    },
  };
}

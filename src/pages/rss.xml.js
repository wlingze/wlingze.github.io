import { articles } from '../lib/content.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const site = 'https://wlingze.github.io';

export function GET() {
  const items = articles.slice(0, 40).map((article) => `    <item>
      <title>${escape(article.title)}</title>
      <link>${site}${encodeURI(article.url)}</link>
      <guid isPermaLink="true">${site}${encodeURI(article.url)}</guid>
      <pubDate>${new Date(article.date).toUTCString()}</pubDate>
      <description>${escape(article.excerpt)}</description>
${article.categories.map((category) => `      <category>${escape(category)}</category>`).join('\n')}
    </item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>令则 · 文章</title>
    <link>${site}/writing/</link>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
    <description>程序分析、终端应用与技术写作。</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date(articles[0]?.date ?? Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}

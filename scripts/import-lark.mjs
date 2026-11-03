import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import sharp from 'sharp';

// Read-only CLI exports stay outside the repository. Never persist auth responses here.
const input = path.resolve(process.argv[2] || '/tmp/wlingze-blog-sources');
const root = process.cwd();
const nodes = JSON.parse(await fs.readFile(path.join(input, 'article-index.json'), 'utf8'));
const resources = JSON.parse(await fs.readFile(path.join(input, 'media-index.json'), 'utf8'));
const excluded = new Set(['syntaxflow-intro', 'syntaxflow-basics', 'syntaxflow-comparison', 'irify-performance']);
const output = path.join(root, 'docs/published');
const mediaDir = path.join(root, 'docs/.vuepress/public/media/articles');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(mediaDir, { recursive: true });
await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
const media = {};
const converted = new Map();
const manifest = [];

async function convert(token) {
  if (converted.has(token)) return converted.get(token);
  const entry = resources[token];
  if (!entry) return null;
  let source = entry.path;
  if (!source) {
    const existing = (await fs.readdir(path.join(input, 'media'))).find((name) => name.startsWith(`${entry.key}.`));
    if (existing) source = path.join(input, 'media', existing);
  }
  if (!source) return null;
  const filename = `${entry.key}.webp`;
  const destination = path.join(mediaDir, filename);
  let image;
  try {
    image = await sharp(destination).metadata();
  } catch {
    image = await sharp(source).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ lossless: true, effort: 1 }).toFile(destination);
  }
  const url = `/media/articles/${filename}`;
  media[url] = { width: image.width, height: image.height };
  converted.set(token, url);
  return url;
}

for (const node of nodes) {
  if (excluded.has(node.slug)) continue;
  const raw = JSON.parse(await fs.readFile(path.join(input, `article-${node.slug}.json`), 'utf8'));
  let content = raw.data.document.content.replace(/^<title>[\s\S]*?<\/title>\s*/, '');
  const notes = [];
  const imageMatches = [...content.matchAll(/!\[([^\]]*)\]\((?:https:\/\/feishu\.cn\/file\/)?([A-Za-z0-9]{20,})\)/g)];
  let sequence = 0;
  for (const match of imageMatches) {
    sequence += 1;
    const local = await convert(match[2]);
    const alt = match[1] || `${node.title.trim()}：原文配图 ${sequence}`;
    content = content.replace(match[0], local ? `![${alt}](${local})` : `[原文配图 ${sequence}（需飞书权限）](${node.url})`);
    if (!local) notes.push(`配图 ${sequence} 未取得，保留原文入口。`);
  }
  for (const match of [...content.matchAll(/<whiteboard[^>]*token="([^"]+)"[^>]*>[\s\S]*?<\/whiteboard>|<whiteboard[^>]*token="([^"]+)"[^>]*\/?\s*>/g)]) {
    const local = await convert(match[1] || match[2]);
    content = content.replace(match[0], local ? `\n\n![${node.title.trim()}：原文结构图](${local})\n\n` : `\n\n[查看原文结构图](${node.url})\n\n`);
    if (!local) notes.push('结构图未取得，保留原文入口。');
  }
  // Embedded tables are not plain document content. Preserve a useful source link;
  // do not invent their cells or quietly drop the material.
  content = content.replace(/<(sheet|bitable)\b([^>]*)>[\s\S]*?<\/\1>/g, (match, type) => {
    notes.push('原文包含在线表格，需通过原文查看。');
    return `\n\n> [查看原文中的${type === 'sheet' ? '电子表格' : '多维表格'}](${node.url})（需原文访问权限）\n\n`;
  });
  const created = new Date(Number(node.obj_create_time) * 1000).toISOString();
  const updated = new Date(Number(node.obj_edit_time) * 1000).toISOString();
  const category = node.slug.startsWith('yjz') ? '编译与运行时' : node.slug.startsWith('irify') ? 'IRify' : node.slug.startsWith('yakssa') ? '程序分析' : 'SyntaxFlow';
  const data = {
    title: node.title.trim(),
    date: created,
    permalink: `/writing/${node.slug}/`,
    categories: [category],
    tags: [category, '技术文章'],
    source: node.url,
    sourceName: '飞书源文档',
    sourceCreatedAt: created,
    sourceUpdatedAt: updated,
    dateBasis: 'source-created',
    originalPublishedAt: null,
    publicationDateVerified: false,
    publicationStatus: 'author-confirmed',
    importedAt: '2026-10-30',
    ...(notes.length ? { conversionNotes: [...new Set(notes)] } : {}),
  };
  const filename = `docs/published/${node.slug}.md`;
  await fs.writeFile(path.join(root, filename), matter.stringify(content.trim() + '\n', data));
  manifest.push({ title: data.title, path: filename, source: data.source, sourceCreatedAt: created, sourceUpdatedAt: updated, originalPublishedAt: null, dateBasis: data.dateBasis, publicationStatus: data.publicationStatus, images: imageMatches.length, conversionNotes: [...new Set(notes)] });
}
await fs.writeFile(path.join(root, 'src/data/media.json'), JSON.stringify(media, null, 2) + '\n');
await fs.writeFile(path.join(root, '.hallmark/import-manifest.json'), JSON.stringify({ importedAt: '2026-10-30', datePolicy: 'Dates are source document creation timestamps, not independently verified public publication dates.', articles: manifest }, null, 2) + '\n');
console.log(`Imported ${manifest.length} Markdown articles; localized ${converted.size} images and diagrams.`);
console.log(`Source timestamps retained; public publication dates remain explicitly unverified.`);

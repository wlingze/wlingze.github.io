import { articles, stamp } from '../lib/content.mjs';

export function GET() {
  const records = articles.map(({ title, url, date, categories, tags, text }) => ({ title, url, date: stamp(date), categories, tags, text: text.slice(0, 12000) }));
  return new Response(JSON.stringify(records), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

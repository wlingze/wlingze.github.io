// Dev-only review endpoint.
//
// The browser posts comments here; nothing is served by the production build
// because the plugin only applies to the dev server and the client script is
// inlined behind `import.meta.env.DEV`.
import path from 'node:path';
import { addComment, listComments } from '../src/lib/comments-store.mjs';

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';

const relativePath = (file) => {
  if (!file) return '';
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
};

export default function devComments() {
  return {
    name: 'dev-comments',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'dev-comments-api',
                apply: 'serve',
                configureServer(server) {
                  server.middlewares.use('/__dev-comments', (req, res) => {
                    const url = new URL(req.url || '/', 'http://localhost');
                    const send = (status, body) => {
                      res.statusCode = status;
                      res.setHeader('content-type', 'application/json; charset=utf-8');
                      res.end(JSON.stringify(body));
                    };

                    if (req.method === 'GET') {
                      return send(200, {
                        root: process.cwd(),
                        comments: listComments({
                          page: url.searchParams.get('page') || undefined,
                          includeResolved: url.searchParams.get('all') === '1',
                        }),
                      });
                    }
                    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });

                    let raw = '';
                    req.on('data', (chunk) => {
                      raw += chunk;
                      if (raw.length > 32768) req.destroy();
                    });
                    req.on('end', () => {
                      let body;
                      try { body = JSON.parse(raw); } catch { return send(400, { error: 'invalid JSON' }); }
                      const comment = clean(body.comment, 2000);
                      if (!comment) return send(400, { error: 'comment is required' });
                      const entry = addComment({
                        page: clean(body.page, 200) || '/',
                        quote: clean(body.quote, 400),
                        comment,
                        sourceFile: relativePath(clean(body.sourceFile, 400)),
                        sourceLine: Number(body.sourceLine) || 0,
                        selector: clean(body.selector, 400),
                      });
                      send(200, { root: process.cwd(), comment: entry });
                    });
                  });
                },
              },
            ],
          },
        });
      },
    },
  };
}

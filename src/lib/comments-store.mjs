// Comment store for the dev review loop.
//
// The browser writes comments through the dev-server endpoint, the agent reads
// them with `npm run comments -- list`, and fixes are marked with `resolve`.
// The file stays out of git (see .hallmark/.gitignore).
import fs from 'node:fs';
import path from 'node:path';

export const COMMENTS_FILE = path.resolve('.hallmark/comments.json');

const readStore = (store) => {
  try {
    const data = JSON.parse(fs.readFileSync(store, 'utf8'));
    return { comments: Array.isArray(data.comments) ? data.comments : [] };
  } catch {
    return { comments: [] };
  }
};

const writeStore = (data, store) => {
  fs.mkdirSync(path.dirname(store), { recursive: true });
  fs.writeFileSync(store, `${JSON.stringify(data, null, 2)}\n`);
};

export const listComments = ({ store = COMMENTS_FILE, page, includeResolved = false } = {}) =>
  readStore(store).comments
    .filter((item) => (page ? item.page === page : true))
    .filter((item) => includeResolved || item.status === 'open');

export const addComment = ({ page, quote, comment, sourceFile, sourceLine, selector }, store = COMMENTS_FILE) => {
  const data = readStore(store);
  const id = data.comments.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const entry = {
    id,
    page: page || '/',
    quote: quote || '',
    comment: comment || '',
    sourceFile: sourceFile || '',
    sourceLine: Number(sourceLine) || 0,
    selector: selector || '',
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  data.comments.push(entry);
  writeStore(data, store);
  return entry;
};

const setStatus = (id, status, note, store) => {
  const data = readStore(store);
  const entry = data.comments.find((item) => Number(item.id) === Number(id));
  if (!entry) return null;
  entry.status = status;
  if (status === 'resolved') {
    entry.resolvedAt = new Date().toISOString();
    entry.note = note || '';
  } else {
    delete entry.resolvedAt;
    delete entry.note;
  }
  writeStore(data, store);
  return entry;
};

export const resolveComment = (id, note = '', store = COMMENTS_FILE) => setStatus(id, 'resolved', note, store);
export const reopenComment = (id, store = COMMENTS_FILE) => setStatus(id, 'open', '', store);

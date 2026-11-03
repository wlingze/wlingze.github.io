#!/usr/bin/env node
// Review comments written from the dev page.
//
//   npm run comments -- list [--all]
//   npm run comments -- resolve <id> ["what changed"]
//   npm run comments -- reopen <id>
import { listComments, resolveComment, reopenComment, COMMENTS_FILE } from '../src/lib/comments-store.mjs';

const [action = 'list', ...rest] = process.argv.slice(2);
const all = rest.includes('--all');
const ids = rest.filter((value) => /^\d+$/.test(value));
const note = rest.filter((value) => !/^\d+$/.test(value) && value !== '--all').join(' ');

const show = (item) => {
  const location = item.sourceFile ? ` ${item.sourceFile}${item.sourceLine ? `:${item.sourceLine}` : ''}` : '';
  console.log(`#${item.id} ${item.status} ${item.page}${location}`);
  if (item.quote) console.log(`  > ${item.quote.replaceAll('\n', ' ').slice(0, 180)}`);
  console.log(`  ${item.comment.replaceAll('\n', '\n  ')}`);
  if (item.note) console.log(`  note: ${item.note}`);
};

if (action === 'list') {
  const items = listComments({ includeResolved: all });
  if (!items.length) console.log(all ? 'No comments.' : 'No open comments.');
  else items.forEach(show);
} else if (action === 'resolve' || action === 'reopen') {
  if (!ids.length) {
    console.error(`usage: npm run comments -- ${action} <id> [note]`);
    process.exit(1);
  }
  for (const id of ids) {
    const entry = action === 'resolve' ? resolveComment(id, note) : reopenComment(id);
    console.log(entry ? `#${id} ${entry.status}` : `#${id} not found`);
  }
} else {
  console.error(`unknown action: ${action}`);
  console.error('usage: comments [list [--all] | resolve <id> [note] | reopen <id>]');
  process.exit(1);
}

if (action === 'list' && !listComments({ includeResolved: true }).length) {
  console.log(`(${COMMENTS_FILE.replace(`${process.cwd()}/`, '')} is empty)`);
}

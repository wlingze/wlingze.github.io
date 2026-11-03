// Public contact details. The email is the only field that needs filling in;
// pages hide the contact block while it is empty.
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('src/data/contact.json', 'utf8'));

export const email = typeof data.email === 'string' ? data.email.trim() : '';
export const mailto = email ? `mailto:${email}` : '';

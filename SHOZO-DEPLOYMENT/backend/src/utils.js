'use strict';

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const BOOLEAN_COLUMNS = new Set(['featured', 'published']);

/** snake_case DB row -> camelCase API object (0/1 flags become booleans). */
function serialize(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = BOOLEAN_COLUMNS.has(k) ? Boolean(v) : v;
  return out;
}

/** camelCase API object -> { column: sqliteValue } (booleans become 0/1, undefined is dropped). */
function toRow(data) {
  const row = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    row[snake(k)] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return row;
}

function slugify(s) {
  const out = String(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/g, '');
  return out || 'item';
}

/** `table` is always a developer-supplied constant, never user input. */
function uniqueSlug(db, table, base) {
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`);
  let candidate = base;
  for (let n = 2; exists.get(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

module.exports = { serialize, toRow, slugify, uniqueSlug, inr, csvCell };

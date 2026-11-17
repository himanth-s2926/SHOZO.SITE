'use strict';
const express = require('express');
const { HttpError } = require('./middleware/errors');
const { parse, schemas } = require('./validate');
const { serialize, toRow, slugify, uniqueSlug } = require('./utils');

/**
 * Generic admin CRUD router. `table` / `orderBy` are developer constants; column names come
 * from the zod schema keys, never from request data, so nothing user-controlled reaches SQL text.
 */
function createCrud({ db, table, schema, orderBy, slugged = false }) {
  const router = express.Router();
  const patchSchema = schema.partial();
  const byId = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);

  const getOr404 = (rawId) => {
    const row = byId.get(parse(schemas.id, rawId));
    if (!row) throw new HttpError(404, 'not_found', 'Record not found.');
    return row;
  };

  router.get('/', (req, res) => {
    res.json({ data: db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all().map(serialize) });
  });

  router.get('/:id', (req, res) => res.json({ data: serialize(getOr404(req.params.id)) }));

  router.post('/', (req, res) => {
    const data = parse(schema, req.body);
    if (slugged) data.slug = uniqueSlug(db, table, data.slug || slugify(data.title));
    const row = toRow(data);
    const cols = Object.keys(row);
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`)
      .run(row);
    res.status(201).json({ data: serialize(byId.get(info.lastInsertRowid)) });
  });

  router.patch('/:id', (req, res) => {
    const existing = getOr404(req.params.id);
    const row = toRow(parse(patchSchema, req.body));
    const cols = Object.keys(row);
    if (!cols.length) throw new HttpError(400, 'validation_error', 'Send at least one field to update.');
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @__id`)
      .run({ ...row, __id: existing.id });
    res.json({ data: serialize(byId.get(existing.id)) });
  });

  router.delete('/:id', (req, res) => {
    const existing = getOr404(req.params.id);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { createCrud };

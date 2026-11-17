'use strict';
const express = require('express');
const { HttpError } = require('../middleware/errors');
const { parse, schemas } = require('../validate');
const { createCrud } = require('../crud');
const { serialize, csvCell } = require('../utils');

/** Mounted behind requireAdmin in app.js: every route here needs a valid bearer token. */
function adminRoutes({ db }) {
  const router = express.Router();

  router.use('/projects', createCrud({ db, table: 'projects', schema: schemas.project, orderBy: 'sort_order, year DESC, id', slugged: true }));
  router.use('/posts', createCrud({ db, table: 'posts', schema: schemas.post, orderBy: 'published_at DESC, id DESC', slugged: true }));
  router.use('/services', createCrud({ db, table: 'services', schema: schemas.service, orderBy: 'sort_order, id' }));
  router.use('/process-steps', createCrud({ db, table: 'process_steps', schema: schemas.processStep, orderBy: 'step_no' }));
  router.use('/team', createCrud({ db, table: 'team_members', schema: schemas.team, orderBy: 'sort_order, id' }));

  /* ---------- Inquiries ---------- */
  const inquiryFilter = (q) => (q.status ? { clause: 'WHERE status = @status', params: { status: q.status } } : { clause: '', params: {} });

  router.get('/inquiries', (req, res) => {
    const q = parse(schemas.adminInquiryQuery, req.query);
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const { clause, params } = inquiryFilter(q);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM inquiries ${clause}`).get(params).n;
    const rows = db
      .prepare(`SELECT * FROM inquiries ${clause} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset: (page - 1) * limit });
    res.json({ data: rows.map(serialize), meta: { total, page, limit } });
  });

  // Registered before /:id so "export.csv" isn't treated as an id.
  router.get('/inquiries/export.csv', (req, res) => {
    const q = parse(schemas.adminInquiryQuery, req.query);
    const { clause, params } = inquiryFilter(q);
    const rows = db.prepare(`SELECT * FROM inquiries ${clause} ORDER BY created_at DESC, id DESC`).all(params);
    const header = ['id', 'received_at_utc', 'status', 'name', 'email', 'space_type', 'budget', 'message'];
    const lines = rows.map((r) =>
      [r.id, r.created_at, r.status, r.name, r.email, r.space_type, r.budget, r.message].map(csvCell).join(','));
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="shozo-inquiries.csv"')
      .send('\uFEFF' + [header.join(','), ...lines].join('\r\n') + '\r\n');
  });

  const inquiryById = (rawId) => {
    const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(parse(schemas.id, rawId));
    if (!row) throw new HttpError(404, 'not_found', 'Inquiry not found.');
    return row;
  };

  router.get('/inquiries/:id', (req, res) => res.json({ data: serialize(inquiryById(req.params.id)) }));

  router.patch('/inquiries/:id', (req, res) => {
    const row = inquiryById(req.params.id);
    const { status } = parse(schemas.inquiryStatus, req.body);
    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, row.id);
    res.json({ data: serialize(inquiryById(row.id)) });
  });

  router.delete('/inquiries/:id', (req, res) => {
    db.prepare('DELETE FROM inquiries WHERE id = ?').run(inquiryById(req.params.id).id);
    res.status(204).end();
  });

  /* ---------- Newsletter subscribers (read-only; tokens are never exposed) ---------- */
  router.get('/subscribers', (req, res) => {
    const rows = db.prepare('SELECT id, email, status, created_at FROM subscribers ORDER BY created_at DESC, id DESC').all();
    res.json({ data: rows.map(serialize), meta: { total: rows.length } });
  });

  return router;
}

module.exports = { adminRoutes };

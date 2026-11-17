'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../middleware/errors');
const { parse, schemas } = require('../validate');
const { serialize, inr } = require('../utils');

const PROJECT_COLS = 'id, slug, title, category, year, image_url, image_alt, description, featured';
const POST_LIST_COLS = 'id, slug, title, category, excerpt, image_url, image_alt, featured, published_at';

function publicRoutes({ db, config, mailer }) {
  const router = express.Router();

  const limiter = (limit) =>
    rateLimit({
      windowMs: config.limits.windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'rate_limited', message: 'Too many requests. Please try again later.' },
    });

  const fireAndForget = (label, fn) => {
    // An email failure must never fail the visitor's request.
    Promise.resolve().then(fn).catch((err) => console.error(`[mail] ${label} failed:`, err.message));
  };

  /* ---------- Contact form ---------- */
  router.post('/inquiries', limiter(config.limits.inquiryMax), (req, res) => {
    // Honeypot: real visitors never see this field. Pretend success so bots learn nothing.
    if (req.body && typeof req.body.website === 'string' && req.body.website.trim() !== '') {
      return res.status(201).json({ ok: true });
    }
    const d = parse(schemas.inquiry, req.body);
    const info = db
      .prepare('INSERT INTO inquiries (name, email, space_type, budget, message, ip) VALUES (?,?,?,?,?,?)')
      .run(d.name, d.email, d.space, d.budget, d.message ?? '', req.ip);
    const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(info.lastInsertRowid);

    fireAndForget('studio notification', () => mailer.notifyNewInquiry(row));
    if (config.mail.autoReply) fireAndForget('auto-reply', () => mailer.sendAutoReply(row));

    return res.status(201).json({ ok: true });
  });

  /* ---------- Newsletter (journal page: "one short letter a month") ---------- */
  router.post('/newsletter/subscribe', limiter(config.limits.newsletterMax), (req, res) => {
    const { email } = parse(schemas.subscribe, req.body);
    // Same response whether or not the address already exists, so it can't be probed.
    // An address that previously unsubscribed is NOT re-activated here (that needs double opt-in).
    db.prepare('INSERT INTO subscribers (email, token) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
      .run(email, crypto.randomBytes(24).toString('hex'));
    res.json({ ok: true });
  });

  router.post('/newsletter/unsubscribe', limiter(config.limits.newsletterMax), (req, res) => {
    const { token } = parse(schemas.unsubscribe, req.body);
    db.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE token = ?").run(token);
    res.json({ ok: true });
  });

  /* ---------- Projects ---------- */
  router.get('/projects', (req, res) => {
    const q = parse(schemas.listQuery, req.query);
    const where = ['published = 1'];
    const params = {};
    if (q.category) { where.push('category = @category'); params.category = q.category; }
    if (q.featured) { where.push('featured = @featured'); params.featured = q.featured === 'true' ? 1 : 0; }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${clause}`).get(params).n;
    const rows = db
      .prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE ${clause}
                ORDER BY sort_order ASC, year DESC, id ASC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: q.limit ?? 50, offset: q.offset ?? 0 });
    res.json({ data: rows.map(serialize), meta: { total } });
  });

  router.get('/projects/:slug', (req, res) => {
    const row = db.prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE slug = ? AND published = 1`).get(req.params.slug);
    if (!row) throw new HttpError(404, 'not_found', 'Project not found.');
    res.json({ data: serialize(row) });
  });

  /* ---------- Journal ---------- */
  router.get('/posts', (req, res) => {
    const q = parse(schemas.listQuery, req.query);
    const where = ['published = 1'];
    const params = {};
    if (q.featured) { where.push('featured = @featured'); params.featured = q.featured === 'true' ? 1 : 0; }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${clause}`).get(params).n;
    const rows = db
      .prepare(`SELECT ${POST_LIST_COLS} FROM posts WHERE ${clause}
                ORDER BY published_at DESC, id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: q.limit ?? 50, offset: q.offset ?? 0 });
    res.json({ data: rows.map(serialize), meta: { total } });
  });

  router.get('/posts/:slug', (req, res) => {
    const row = db.prepare(`SELECT ${POST_LIST_COLS}, body FROM posts WHERE slug = ? AND published = 1`).get(req.params.slug);
    if (!row) throw new HttpError(404, 'not_found', 'Post not found.');
    res.json({ data: serialize(row) });
  });

  /* ---------- Services, process, team ---------- */
  router.get('/services', (req, res) => {
    const rows = db.prepare('SELECT id, code, title, description, price_from FROM services ORDER BY sort_order, id').all();
    res.json({ data: rows.map((r) => ({ ...serialize(r), priceFromLabel: `From ${inr(r.price_from)}` })) });
  });

  router.get('/process', (req, res) => {
    res.json({ data: db.prepare('SELECT id, step_no, title, description FROM process_steps ORDER BY step_no').all().map(serialize) });
  });

  router.get('/team', (req, res) => {
    res.json({ data: db.prepare('SELECT id, name, role, image_url, image_alt FROM team_members ORDER BY sort_order, id').all().map(serialize) });
  });

  return router;
}

module.exports = { publicRoutes };

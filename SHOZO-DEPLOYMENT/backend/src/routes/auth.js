'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../middleware/errors');
const { requireAdmin } = require('../middleware/auth');
const { parse, schemas } = require('../validate');

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * ADMIN_EMAIL / ADMIN_PASSWORD in the environment are the source of truth for the admin login:
 * created on first boot, and the password is rotated if the env value changes.
 */
function ensureAdmin(db, config) {
  const { adminEmail: email, adminPassword: password } = config;
  if (!email || !password) {
    console.warn('[auth] ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin account will be created.');
    return;
  }
  if (password.length < 10 || Buffer.byteLength(password) > 72) {
    throw new Error('ADMIN_PASSWORD must be 10 characters or longer (and at most 72 bytes).');
  }
  const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!existing) {
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(email, bcrypt.hashSync(password, 12));
    console.log(`[auth] Created admin account for ${email}`);
  } else if (!bcrypt.compareSync(password, existing.password_hash)) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), existing.id);
    console.log(`[auth] Updated password for ${email}`);
  }
}

function authRoutes({ db, config }) {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: config.limits.windowMs,
    limit: config.limits.loginMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many login attempts. Please try again later.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(schemas.login, req.body);
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
    if (!admin || !ok) throw new HttpError(401, 'invalid_credentials', 'Incorrect email or password.');
    const token = jwt.sign({ sub: String(admin.id), email: admin.email }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn,
    });
    res.json({ token, expiresIn: config.jwtExpiresIn });
  });

  router.get('/me', requireAdmin(config), (req, res) => {
    res.json({ data: { id: req.admin.sub, email: req.admin.email } });
  });

  return router;
}

module.exports = { authRoutes, ensureAdmin };

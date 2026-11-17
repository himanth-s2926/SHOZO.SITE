'use strict';
const crypto = require('crypto');
const path = require('path');

const bool = (v, fallback = false) =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : fallback);
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProd) {
      throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
    }
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[config] JWT_SECRET not set (or too short): using a temporary secret. Admin sessions end on restart.');
  }

  return {
    nodeEnv: env.NODE_ENV || 'development',
    isProd,
    port: int(env.PORT, 3000),
    dbPath: env.DB_PATH || path.join(__dirname, '..', 'data', 'shozo.db'),
    publicDir: env.PUBLIC_DIR || path.join(__dirname, '..', 'public'),

    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',

    // Only needed if the HTML is hosted on a different origin than this API.
    corsOrigins: list(env.CORS_ORIGINS),
    // Set to 1 when running behind one reverse proxy (nginx, Render, Railway, Fly...)
    trustProxy: env.TRUST_PROXY ? int(env.TRUST_PROXY, 1) : false,

    mail: {
      smtpHost: env.SMTP_HOST || '',
      smtpPort: int(env.SMTP_PORT, 587),
      smtpSecure: bool(env.SMTP_SECURE, false),
      smtpUser: env.SMTP_USER || '',
      smtpPass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || 'SHOZO Website <no-reply@shozo.studio>',
      studioInbox: env.STUDIO_INBOX || 'hello@shozo.studio',
      // Sends a "we got your inquiry" email to whoever submitted the form.
      // Off by default: a public form that emails arbitrary addresses can be abused.
      autoReply: bool(env.SEND_AUTOREPLY, false),
    },

    limits: {
      windowMs: int(env.RATE_WINDOW_MS, 15 * 60 * 1000),
      inquiryMax: int(env.RATE_INQUIRY_MAX, 5),
      newsletterMax: int(env.RATE_NEWSLETTER_MAX, 10),
      loginMax: int(env.RATE_LOGIN_MAX, 10),
    },
  };
}

module.exports = { loadConfig };

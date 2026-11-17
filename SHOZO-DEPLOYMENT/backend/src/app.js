'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/errors');
const { requireAdmin } = require('./middleware/auth');
const { publicRoutes } = require('./routes/public');
const { authRoutes } = require('./routes/auth');
const { adminRoutes } = require('./routes/admin');

function createApp({ db, config, mailer }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // The pages use inline <style>/<script>, Google Fonts and remote (https) images, so the
  // policy allows exactly that. Moving the inline code into files would let you drop 'unsafe-inline'.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          // Safari would upgrade http://localhost requests to https and break local development.
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
    })
  );

  if (config.corsOrigins.length) app.use('/api', cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes({ db, config }));
  app.use('/api/admin', requireAdmin(config), adminRoutes({ db }));
  app.use('/api', publicRoutes({ db, config, mailer }));
  app.use('/api', notFound);

  app.use(express.static(config.publicDir));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };

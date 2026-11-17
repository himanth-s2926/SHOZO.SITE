'use strict';
require('dotenv').config({ quiet: true });
const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createMailer } = require('./services/mailer');
const { ensureAdmin } = require('./routes/auth');
const { createApp } = require('./app');

const config = loadConfig();
const db = openDb(config.dbPath);
ensureAdmin(db, config);

const app = createApp({ db, config, mailer: createMailer(config) });
const server = app.listen(config.port, () => {
  console.log(`SHOZO running on http://localhost:${config.port}  (${config.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

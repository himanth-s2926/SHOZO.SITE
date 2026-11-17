'use strict';
const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');

function requireAdmin(config) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') {
      return next(new HttpError(401, 'unauthorized', 'Missing bearer token.'));
    }
    try {
      req.admin = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      return next();
    } catch {
      return next(new HttpError(401, 'unauthorized', 'Invalid or expired token.'));
    }
  };
}

module.exports = { requireAdmin };

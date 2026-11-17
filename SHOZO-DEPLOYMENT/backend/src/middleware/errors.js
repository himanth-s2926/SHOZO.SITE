'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFound(req, res, next) {
  next(new HttpError(404, 'not_found', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'server_error';
  let message = 'Something went wrong on our side.';
  let details;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'invalid_json'; message = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'payload_too_large'; message = 'Request body is too large.';
  } else if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      status = 409; code = 'conflict'; message = 'A record with that unique value already exists.';
    } else {
      status = 400; code = 'constraint_failed'; message = 'The data violates a database constraint.';
    }
  } else {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  res.status(status).json({ error: code, message, ...(details ? { details } : {}) });
}

module.exports = { HttpError, notFound, errorHandler };

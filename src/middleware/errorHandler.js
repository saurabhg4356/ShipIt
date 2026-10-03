const config = require('../config/env');
const logger = require('../utils/logger');
const { AppError, NotFoundError } = require('../utils/errors');

/**
 * Middleware to catch 404 for unmatched routes
 */
function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Centralized error handling middleware
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle malformed JSON request body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Malformed JSON in request body';
  }

  // Internal logging
  logger.error(`[${req.method}] ${req.originalUrl} - ${statusCode} ${errorCode}: ${message}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    errorCode,
    stack: config.isProduction ? undefined : err.stack,
  });

  const response = {
    error: {
      code: errorCode,
      message: message,
    },
  };

  // Only attach stack trace in non-production environments when specifically requested / debug mode
  if (!config.isProduction && process.env.DEBUG === 'true') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

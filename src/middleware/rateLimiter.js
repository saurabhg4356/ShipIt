const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { RateLimitError } = require('../utils/errors');

/**
 * Standard error response handler for rate limiting
 */
function rateLimitHandler(req, res, next) {
  next(new RateLimitError());
}

/**
 * General API rate limiter (applied to /api/* routes)
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => config.isTest && process.env.TEST_RATE_LIMIT !== 'true',
});

/**
 * Stricter rate limiter for link creation (POST /api/links)
 */
const createLinkLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.createMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => config.isTest && process.env.TEST_RATE_LIMIT !== 'true',
});

/**
 * Rate limiter for short link redirection (protection against scraping / DDoS)
 */
const redirectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 120, // 120 redirects per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => config.isTest && process.env.TEST_RATE_LIMIT !== 'true',
});

module.exports = {
  apiLimiter,
  createLinkLimiter,
  redirectLimiter,
};

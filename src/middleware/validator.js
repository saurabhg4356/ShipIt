const { ValidationError } = require('../utils/errors');
const { isValidShortCode } = require('../utils/shortCode');

/**
 * Validate URL creation request
 */
function validateCreateLink(req, res, next) {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string' || url.trim() === '') {
    return next(new ValidationError('URL is required'));
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl.length > 2048) {
    return next(new ValidationError('URL must not exceed 2048 characters'));
  }

  // Parse and validate URL structure
  try {
    const parsedUrl = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return next(new ValidationError('URL protocol must be http or https'));
    }
    // Prevent localhost or loopback urls if desired, but allow normal valid hostnames
    if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
      return next(new ValidationError('Invalid URL hostname'));
    }
  } catch (err) { // eslint-disable-line no-unused-vars
    return next(new ValidationError('Invalid URL format'));
  }

  req.body.url = trimmedUrl;
  next();
}

/**
 * Validate short code parameter in path
 */
function validateShortCodeParam(req, res, next) {
  const { code } = req.params;

  if (!code || !isValidShortCode(code)) {
    return next(
      new ValidationError('Invalid short code format. Must be 4-16 alphanumeric characters')
    );
  }

  next();
}

/**
 * Validate pagination query parameters
 */
function validatePagination(req, res, next) {
  let { page = '1', limit = '20' } = req.query;

  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);

  if (isNaN(parsedPage) || parsedPage < 1) {
    return next(new ValidationError('Page must be a positive integer greater than 0'));
  }

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return next(new ValidationError('Limit must be an integer between 1 and 100'));
  }

  req.pagination = {
    page: parsedPage,
    limit: parsedLimit,
  };

  next();
}

module.exports = {
  validateCreateLink,
  validateShortCodeParam,
  validatePagination,
};

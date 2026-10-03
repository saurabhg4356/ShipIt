const linkService = require('../services/linkService');

/**
 * Handle POST /api/links - Create short link
 */
async function createLink(req, res, next) {
  try {
    const { url } = req.body;
    const link = await linkService.createLink({ url });
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /:code - Redirect to original long URL with atomic click tracking
 */
async function redirectLink(req, res, next) {
  try {
    const { code } = req.params;
    const originalUrl = await linkService.resolveAndTrackClick(code);
    res.redirect(302, originalUrl);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /api/links/:code/stats - Get link analytics
 */
async function getLinkStats(req, res, next) {
  try {
    const { code } = req.params;
    const stats = await linkService.getLinkStats(code);
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /api/links - List short links with pagination
 */
async function listLinks(req, res, next) {
  try {
    const result = await linkService.listLinks(req.pagination);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle DELETE /api/links/:code - Delete short link
 */
async function deleteLink(req, res, next) {
  try {
    const { code } = req.params;
    const result = await linkService.deleteLink(code);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createLink,
  redirectLink,
  getLinkStats,
  listLinks,
  deleteLink,
};

const express = require('express');
const {
  createLink,
  getLinkStats,
  listLinks,
  deleteLink,
} = require('../controllers/linkController');
const {
  validateCreateLink,
  validateShortCodeParam,
  validatePagination,
} = require('../middleware/validator');
const { createLinkLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/links - Create short link (stricter rate limit & body validation)
router.post('/', createLinkLimiter, validateCreateLink, createLink);

// GET /api/links - List links (paginated)
router.get('/', validatePagination, listLinks);

// GET /api/links/:code/stats - Get link analytics
router.get('/:code/stats', validateShortCodeParam, getLinkStats);

// DELETE /api/links/:code - Delete link
router.delete('/:code', validateShortCodeParam, deleteLink);

module.exports = router;

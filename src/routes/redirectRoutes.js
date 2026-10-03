const express = require('express');
const { redirectLink } = require('../controllers/linkController');
const { validateShortCodeParam } = require('../middleware/validator');
const { redirectLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// GET /:code - Redirect to long URL with atomic click analytics
router.get('/:code', redirectLimiter, validateShortCodeParam, redirectLink);

module.exports = router;

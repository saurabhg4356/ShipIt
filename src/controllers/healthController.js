const db = require('../db');

/**
 * Health check controller
 * Checks service status and database connectivity
 */
async function getHealth(req, res, next) {
  try {
    const isDbConnected = await db.checkConnection();

    const healthStatus = {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    if (!isDbConnected) {
      return res.status(503).json(healthStatus);
    }

    return res.status(200).json(healthStatus);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth,
};

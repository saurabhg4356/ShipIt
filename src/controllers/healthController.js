/**
 * Health check controller
 * Checks service status and database connectivity (when configured)
 */
let dbCheck = null;

/**
 * Register database health check function (injected from db module)
 */
function registerDbHealthCheck(fn) {
  dbCheck = fn;
}

async function getHealth(req, res, next) {
  try {
    const healthStatus = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    if (dbCheck) {
      const isDbConnected = await dbCheck();
      healthStatus.database = isDbConnected ? 'connected' : 'disconnected';
      if (!isDbConnected) {
        return res.status(503).json(healthStatus);
      }
    } else {
      healthStatus.database = 'not_configured';
    }

    return res.status(200).json(healthStatus);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth,
  registerDbHealthCheck,
};

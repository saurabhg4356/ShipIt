const app = require('./app');
const config = require('./config/env');
const db = require('./db');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => {
  logger.info(`ShipIt server started on port ${config.port}`, {
    env: config.env,
    baseUrl: config.baseUrl,
  });
});

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async (err) => {
    if (err) {
      logger.error('Error during HTTP server shutdown', { error: err.message });
    }
    
    try {
      await db.closePool();
      logger.info('Database connection pool closed.');
    } catch (dbErr) {
      logger.error('Error closing database pool', { error: dbErr.message });
    }

    logger.info('Shutdown complete.');
    process.exit(err ? 1 : 0);
  });

  // Force shutdown after timeout if graceful close hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception thrown', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

module.exports = server;

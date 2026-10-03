const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../utils/logger');

let pool = null;

function getPoolConfig() {
  if (config.database.url) {
    return {
      connectionString: config.database.url,
      ssl: config.database.ssl,
      max: config.database.maxConnections,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
      connectionTimeoutMillis: config.database.connectionTimeoutMillis,
    };
  }

  return {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl,
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  };
}

function initPool() {
  if (!pool) {
    const poolConfig = getPoolConfig();
    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', {
        error: err.message,
      });
    });
  }
  return pool;
}

/**
 * Execute a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  const currentPool = initPool();
  try {
    const result = await currentPool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', {
      text,
      durationMs: duration,
      rowCount: result.rowCount,
    });
    return result;
  } catch (err) {
    logger.error('Database query error', {
      text,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Acquire a dedicated client from the pool (for transactions)
 */
async function getClient() {
  const currentPool = initPool();
  return currentPool.connect();
}

/**
 * Check connection to database
 */
async function checkConnection() {
  try {
    const currentPool = initPool();
    const result = await currentPool.query('SELECT 1 AS connected');
    return result.rows && result.rows[0].connected === 1;
  } catch (err) {
    logger.warn('Database health check failed', { error: err.message });
    return false;
  }
}

/**
 * Gracefully close the connection pool
 */
async function closePool() {
  if (pool) {
    logger.info('Closing PostgreSQL connection pool...');
    await pool.end();
    pool = null;
    logger.info('PostgreSQL connection pool closed.');
  }
}

module.exports = {
  query,
  getClient,
  checkConnection,
  closePool,
  initPool,
};

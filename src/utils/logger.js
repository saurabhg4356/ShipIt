const config = require('../config/env');

const LogLevels = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = config.isProduction ? LogLevels.INFO : LogLevels.DEBUG;

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  if (config.isProduction) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.padEnd(5)}] ${message}${metaStr}`;
}

const logger = {
  debug(message, meta) {
    if (currentLevel <= LogLevels.DEBUG && !config.isTest) {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },
  info(message, meta) {
    if (currentLevel <= LogLevels.INFO && !config.isTest) {
      console.log(formatMessage('INFO', message, meta));
    }
  },
  warn(message, meta) {
    if (currentLevel <= LogLevels.WARN && !config.isTest) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },
  error(message, meta) {
    if (!config.isTest) {
      console.error(formatMessage('ERROR', message, meta));
    }
  },
};

module.exports = logger;

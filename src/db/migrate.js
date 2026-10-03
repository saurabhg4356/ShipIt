const db = require('./index');
const logger = require('../utils/logger');

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  original_url TEXT NOT NULL,
  short_code VARCHAR(16) NOT NULL UNIQUE,
  click_count INTEGER DEFAULT 0 NOT NULL,
  last_clicked_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
`;

async function runMigrations() {
  logger.info('Starting database migration...');
  try {
    await db.query(MIGRATION_SQL);
    logger.info('Database schema migration applied successfully.');
    return true;
  } catch (err) {
    logger.error('Failed to apply database migrations', { error: err.message });
    throw err;
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await db.closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await db.closePool();
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  MIGRATION_SQL,
};

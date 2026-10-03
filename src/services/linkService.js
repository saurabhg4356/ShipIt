const db = require('../db');
const config = require('../config/env');
const logger = require('../utils/logger');
const { generateShortCode } = require('../utils/shortCode');
const { NotFoundError, ConflictError } = require('../utils/errors');

const MAX_COLLISION_RETRIES = 5;

/**
 * Format link record into standard API response object
 */
function formatLink(row) {
  return {
    id: row.id,
    originalUrl: row.original_url,
    shortCode: row.short_code,
    shortUrl: `${config.baseUrl}/${row.short_code}`,
    clickCount: parseInt(row.click_count, 10),
    lastClickedAt: row.last_clicked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new short link with automatic collision retry logic
 */
async function createLink({ url, customCode = null }) {
  let attempts = 0;

  while (attempts < MAX_COLLISION_RETRIES) {
    attempts++;
    const code = customCode || generateShortCode(6);

    try {
      const queryText = `
        INSERT INTO links (original_url, short_code)
        VALUES ($1, $2)
        RETURNING id, original_url, short_code, click_count, last_clicked_at, created_at, updated_at;
      `;
      const result = await db.query(queryText, [url, code]);
      const created = result.rows[0];

      logger.info('Short link created successfully', {
        id: created.id,
        shortCode: created.short_code,
        attempts,
      });

      return formatLink(created);
    } catch (err) {
      // PostgreSQL unique_violation error code is 23505
      if (err.code === '23505') {
        logger.warn('Short code collision encountered, retrying...', {
          code,
          attempt: attempts,
        });
        if (customCode) {
          throw new ConflictError(`Short code '${customCode}' is already taken`);
        }
        continue;
      }
      throw err;
    }
  }

  throw new ConflictError('Unable to generate unique short code after multiple attempts. Please try again.');
}

/**
 * Look up link by short code, atomically increment click count, and return target URL
 */
async function resolveAndTrackClick(shortCode) {
  const queryText = `
    UPDATE links
    SET click_count = click_count + 1,
        last_clicked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE short_code = $1
    RETURNING original_url;
  `;
  const result = await db.query(queryText, [shortCode]);

  if (!result.rows || result.rows.length === 0) {
    throw new NotFoundError(`Short code '${shortCode}' was not found`);
  }

  return result.rows[0].original_url;
}

/**
 * Retrieve statistics for a specific short link
 */
async function getLinkStats(shortCode) {
  const queryText = `
    SELECT id, original_url, short_code, click_count, last_clicked_at, created_at, updated_at
    FROM links
    WHERE short_code = $1;
  `;
  const result = await db.query(queryText, [shortCode]);

  if (!result.rows || result.rows.length === 0) {
    throw new NotFoundError(`Short code '${shortCode}' was not found`);
  }

  return formatLink(result.rows[0]);
}

/**
 * List links with pagination
 */
async function listLinks({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const countQuery = 'SELECT COUNT(*) AS total FROM links;';
  const listQuery = `
    SELECT id, original_url, short_code, click_count, last_clicked_at, created_at, updated_at
    FROM links
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2;
  `;

  const [countResult, listResult] = await Promise.all([
    db.query(countQuery),
    db.query(listQuery, [limit, offset]),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: listResult.rows.map(formatLink),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Delete short link by code
 */
async function deleteLink(shortCode) {
  const queryText = `
    DELETE FROM links
    WHERE short_code = $1
    RETURNING id, short_code;
  `;
  const result = await db.query(queryText, [shortCode]);

  if (!result.rows || result.rows.length === 0) {
    throw new NotFoundError(`Short code '${shortCode}' was not found`);
  }

  logger.info('Short link deleted', { shortCode });
  return {
    message: 'Link successfully deleted',
    shortCode,
  };
}

module.exports = {
  createLink,
  resolveAndTrackClick,
  getLinkStats,
  listLinks,
  deleteLink,
  formatLink,
  MAX_COLLISION_RETRIES,
};

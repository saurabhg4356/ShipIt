const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const { generateShortCode } = require('../src/utils/shortCode');

describe('URL Shortener API Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/links - Create Short Link', () => {
    it('should successfully create a short link with valid URL', async () => {
      const mockRow = {
        id: 1,
        original_url: 'https://example.com/very/long/url',
        short_code: 'abc123',
        click_count: 0,
        last_clicked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      });

      const res = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/very/long/url' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('originalUrl', 'https://example.com/very/long/url');
      expect(res.body).toHaveProperty('shortCode', 'abc123');
      expect(res.body).toHaveProperty('shortUrl', 'http://localhost:3000/abc123');
      expect(res.body).toHaveProperty('clickCount', 0);
      expect(res.body).toHaveProperty('createdAt');
    });

    it('should reject link creation when url is missing', async () => {
      const res = await request(app).post('/api/links').send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('URL is required');
    });

    it('should reject malformed URL', async () => {
      const res = await request(app)
        .post('/api/links')
        .send({ url: 'not-a-valid-url' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid URL');
    });

    it('should reject non-http/https protocol', async () => {
      const res = await request(app)
        .post('/api/links')
        .send({ url: 'ftp://ftp.example.com/file' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('protocol must be http or https');
    });

    it('should reject URL exceeding 2048 characters', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      const res = await request(app)
        .post('/api/links')
        .send({ url: longUrl });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('must not exceed 2048 characters');
    });

    it('should retry generation upon collision and succeed if retry is unique', async () => {
      const collisionErr = new Error('duplicate key value violates unique constraint');
      collisionErr.code = '23505';

      const mockRow = {
        id: 2,
        original_url: 'https://example.com/retry-test',
        short_code: 'retry1',
        click_count: 0,
        last_clicked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      jest
        .spyOn(db, 'query')
        .mockRejectedValueOnce(collisionErr) // First attempt hits collision
        .mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 }); // Second attempt succeeds

      const res = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/retry-test' });

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toBe('retry1');
    });

    it('should return 409 CONFLICT if maximum retries are exhausted', async () => {
      const collisionErr = new Error('duplicate key value violates unique constraint');
      collisionErr.code = '23505';

      jest.spyOn(db, 'query').mockRejectedValue(collisionErr);

      const res = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/conflict-exhaustion' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('Unable to generate unique short code');
    });
  });

  describe('GET /:code - Short Link Redirection & Atomic Analytics', () => {
    it('should atomically update click count and redirect (302) to target URL', async () => {
      jest.spyOn(db, 'query').mockImplementation((sql, params) => {
        expect(sql).toContain('click_count = click_count + 1');
        expect(params).toEqual(['target1']);
        return Promise.resolve({
          rows: [{ original_url: 'https://target-destination.com/page' }],
          rowCount: 1,
        });
      });

      const res = await request(app).get('/target1');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://target-destination.com/page');
    });

    it('should return 404 NOT_FOUND when short code does not exist', async () => {
      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const res = await request(app).get('/notfound99');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('not found');
    });

    it('should reject invalid short code format with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).get('/ab'); // less than 4 chars

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/links/:code/stats - Link Analytics', () => {
    it('should return link analytics for valid short code', async () => {
      const now = new Date().toISOString();
      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            original_url: 'https://example.com/stats-target',
            short_code: 'stat01',
            click_count: 42,
            last_clicked_at: now,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
      });

      const res = await request(app).get('/api/links/stat01/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 10,
        originalUrl: 'https://example.com/stats-target',
        shortCode: 'stat01',
        shortUrl: 'http://localhost:3000/stat01',
        clickCount: 42,
        lastClickedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('should return 404 when requested stats code does not exist', async () => {
      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const res = await request(app).get('/api/links/nonexistent/stats');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/links - List Links with Pagination', () => {
    it('should list links with pagination metadata', async () => {
      const now = new Date().toISOString();
      const mockLinks = [
        {
          id: 1,
          original_url: 'https://link1.com',
          short_code: 'code01',
          click_count: 5,
          last_clicked_at: now,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          original_url: 'https://link2.com',
          short_code: 'code02',
          click_count: 12,
          last_clicked_at: now,
          created_at: now,
          updated_at: now,
        },
      ];

      jest
        .spyOn(db, 'query')
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // total count query
        .mockResolvedValueOnce({ rows: mockLinks }); // paginated items query

      const res = await request(app).get('/api/links?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].shortCode).toBe('code01');
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should reject invalid page parameter', async () => {
      const res = await request(app).get('/api/links?page=0');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Page must be a positive integer');
    });

    it('should reject limit parameter exceeding 100', async () => {
      const res = await request(app).get('/api/links?limit=150');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Limit must be an integer between 1 and 100');
    });
  });

  describe('DELETE /api/links/:code - Delete Link', () => {
    it('should successfully delete an existing link', async () => {
      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [{ id: 5, short_code: 'del123' }],
        rowCount: 1,
      });

      const res = await request(app).delete('/api/links/del123');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Link successfully deleted',
        shortCode: 'del123',
      });
    });

    it('should return 404 when deleting a nonexistent link', async () => {
      jest.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const res = await request(app).delete('/api/links/del123');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      const rateLimit = require('express-rate-limit');
      const express = require('express');
      const { RateLimitError } = require('../src/utils/errors');
      const { errorHandler } = require('../src/middleware/errorHandler');

      // Create an isolated sub-app testing rate limiter handler
      const testApp = express();
      const testLimiter = rateLimit({
        windowMs: 1000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next) => next(new RateLimitError()),
      });

      testApp.get('/test-limit', testLimiter, (req, res) => res.json({ ok: true }));
      testApp.use(errorHandler);

      // 1st request -> ok
      const r1 = await request(testApp).get('/test-limit');
      expect(r1.status).toBe(200);

      // 2nd request -> ok
      const r2 = await request(testApp).get('/test-limit');
      expect(r2.status).toBe(200);

      // 3rd request -> throttled (429)
      const r3 = await request(testApp).get('/test-limit');
      expect(r3.status).toBe(429);
      expect(r3.body.error).toEqual({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      });
    });
  });

  describe('Short Code Generator Unit Tests', () => {
    it('should generate valid 6-character alphanumeric codes', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateShortCode(6);
        expect(code).toHaveLength(6);
        expect(/^[a-zA-Z0-9]{6}$/.test(code)).toBe(true);
      }
    });
  });
});

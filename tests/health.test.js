const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

describe('Health and Foundation Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 OK with connected database when DB is healthy', async () => {
      jest.spyOn(db, 'checkConnection').mockResolvedValueOnce(true);

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('database', 'connected');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('should return 503 Service Unavailable with disconnected database when DB is down', async () => {
      jest.spyOn(db, 'checkConnection').mockResolvedValueOnce(false);

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('database', 'disconnected');
    });
  });

  describe('Unmatched routes (404 handling)', () => {
    it('should return standardized 404 NOT_FOUND response for non-existent routes', async () => {
      const res = await request(app).get('/api/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'NOT_FOUND',
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('Malformed JSON handling (400 error handling)', () => {
    it('should return standardized 400 INVALID_JSON for invalid payload', async () => {
      const res = await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('{ malformed: json');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });
});

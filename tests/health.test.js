const request = require('supertest');
const app = require('../src/app');

describe('Health and Foundation Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 OK with operational status and uptime', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.uptime).toBe('number');
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

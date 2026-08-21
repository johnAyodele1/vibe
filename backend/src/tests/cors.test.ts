import request from 'supertest';
import express from 'express';
import cors from 'cors';

describe('CORS Configuration', () => {
  const allowedOrigins = [
    'https://zippo-r8hk.onrender.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
  ];

  const allowedPreviewOrigin =
    /^https:\/\/deploy-preview-\d+--petheven\.netlify\.app$/;

  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          allowedPreviewOrigin.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(new Error('CORS policy violation: Access denied for origin ' + origin));
      },
      credentials: true,
    })
  );

  app.get('/test-cors', (req, res) => {
    res.json({ message: 'cors success' });
  });

  it('allows Netlify deploy preview origins', async () => {
    const res = await request(app)
      .get('/test-cors')
      .set('Origin', 'https://deploy-preview-123--petheven.netlify.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://deploy-preview-123--petheven.netlify.app'
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows standard allowed origins', async () => {
    const res = await request(app)
      .get('/test-cors')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('rejects unauthorized origins', async () => {
    const res = await request(app)
      .get('/test-cors')
      .set('Origin', 'https://unauthorized-domain.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

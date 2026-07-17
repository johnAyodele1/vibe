import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { getCache } from '../config/redisFallback';

describe('Location API', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('GET /api/v1/shared/countries returns 200 without authentication and includes correct keys', async () => {
    const res = await request(app)
      .get('/api/v1/shared/countries')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const country = res.body.find((c: any) => c.code === 'NG');
    expect(country).toBeDefined();
    expect(country.name).toBe('Nigeria');
    expect(country.dialCode).toBe('+234');
    expect(country.flag).toBe('🇳🇬');
  });

  it('GET /api/v1/shared/countries/:code/states returns states for the country', async () => {
    const res = await request(app)
      .get('/api/v1/shared/countries/NG/states')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const state = res.body.find((s: any) => s.name.toLowerCase().includes('lagos') || s.code === 'LA');
    expect(state).toBeDefined();
  });

  it('GET /api/v1/shared/cities?country=NG&state=LA returns cities', async () => {
    const res = await request(app)
      .get('/api/v1/shared/cities?country=NG&state=LA')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('cities endpoint filters by query string', async () => {
    const res = await request(app)
      .get('/api/v1/shared/cities?country=NG&state=LA&q=ike')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((city: any) => {
      expect(city.name.toLowerCase().startsWith('ike')).toBe(true);
    });
  });

  it('countries response is cached', async () => {
    // Clear Map caches beforehand if any
    await request(app).get('/api/v1/shared/countries');
    const cached = await getCache('location:countries');
    expect(cached).toBeDefined();
    expect(Array.isArray(cached)).toBe(true);
  });
});

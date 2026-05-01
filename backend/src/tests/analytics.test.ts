import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import VisitorStat from '../models/VisitorStat';

describe('Analytics Endpoints', () => {
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

  beforeEach(async () => {
    await VisitorStat.deleteMany({});
  });

  describe('POST /api/analytics/visit', () => {
    it('should track site visits and increment count', async () => {
      // First visit
      let response = await request(app)
        .post('/api/analytics/visit')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.visits).toBe(1);

      // Second visit
      response = await request(app)
        .post('/api/analytics/visit')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.visits).toBe(2);

      const stat = await VisitorStat.findOne({ key: 'site_visits' });
      expect(stat?.count).toBe(2);
    });
  });
});

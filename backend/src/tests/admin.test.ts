import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import { generateAccessToken } from '../middleware/auth';

describe('Admin Endpoints', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;
  let userToken: string;
  let testUser: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Set admin env vars for testing
    process.env.ADMIN_EMAIL = 'admin@test.com';
    process.env.ADMIN_PASSWORD = 'adminpassword';
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Report.deleteMany({});

    // Create a regular user
    testUser = await User.create({
      email: 'user@test.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
    });

    userToken = generateAccessToken(testUser._id, false);

    // Login as admin to get token
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'adminpassword',
      });
    adminToken = res.body.data.token;
  });

  describe('POST /api/admin/login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'adminpassword',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should fail with incorrect credentials', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/analytics/visit', () => {
    it('should increment visit counter', async () => {
      const firstRes = await request(app).post('/api/analytics/visit');
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.success).toBe(true);
      expect(firstRes.body.data.visits).toBe(1);

      const secondRes = await request(app).post('/api/analytics/visit');
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.success).toBe(true);
      expect(secondRes.body.data.visits).toBe(2);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('should return analytics for admin', async () => {
      const res = await request(app)
        .get('/api/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('totalReports');
      expect(res.body.data).toHaveProperty('siteVisits');
    });

    it('should fail for non-admin user', async () => {
      const res = await request(app)
        .get('/api/admin/analytics')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/reports', () => {
    it('should return all reports', async () => {
      // Create a report
      await Report.create({
        reporter: testUser._id,
        reported: testUser._id,
        reason: 'Test report',
      });

      const res = await request(app)
        .get('/api/admin/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports).toHaveLength(1);
    });
  });

  describe('POST /api/admin/action', () => {
    it('should block a user', async () => {
      const res = await request(app)
        .post('/api/admin/action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'block',
          targetId: testUser._id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser?.isBlocked).toBe(true);
    });

    it('should delete a user', async () => {
      const res = await request(app)
        .post('/api/admin/action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'delete',
          targetId: testUser._id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deletedUser = await User.findById(testUser._id);
      expect(deletedUser).toBeNull();
    });
  });
});

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import adultRoutes from '../routes/adult.routes';
import { errorHandler } from '../middleware/errorHandler';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

let mongoServer: MongoMemoryServer;
const app = express();
app.use(express.json());
app.use('/api/adult', adultRoutes);
app.use(errorHandler);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Adult Zone Backend Production Tests', () => {
  let accessToken: string;
  let userId: string;

  describe('Authentication', () => {
    it('should register a new adult user', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'test@adult.com',
          password: 'Password123!@#',
          username: 'testuser',
          displayName: 'Test User',
          dateOfBirth: '1990-01-01',
          role: 'user',
          country: 'US',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject underage registration', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'young@adult.com',
          password: 'Password123!@#',
          username: 'younguser',
          displayName: 'Young User',
          dateOfBirth: new Date().toISOString(),
          role: 'user',
          country: 'US',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should verify email and return tokens', async () => {
      const user = await AdultUser.findOne({ email: 'test@adult.com' });
      const res = await request(app)
        .get(`/api/adult/auth/verify-email?token=${user?.emailVerificationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      accessToken = res.body.data.accessToken;
      userId = res.body.data.user.id;
    });

    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/adult/auth/login')
        .send({
          email: 'test@adult.com',
          password: 'Password123!@#',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('Credits & Tipping', () => {
    it('should verify age before tipping', async () => {
        await AdultUser.findByIdAndUpdate(userId, { credits: 1000 });

        const res = await request(app)
          .post('/api/adult/credits/tip')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ recipientId: userId, amount: 10 });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('AGE_NOT_VERIFIED');
    });

    it('should verify age successfully', async () => {
        const res = await request(app)
          .post('/api/adult/auth/verify-age')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
    });

    it('should fail to tip self', async () => {
        const res = await request(app)
          .post('/api/adult/credits/tip')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ recipientId: userId, amount: 10 });

        expect(res.status).toBe(400);
        expect(res.body.error.message).toContain('yourself');
    });
  });
});

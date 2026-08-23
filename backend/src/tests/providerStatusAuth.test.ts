import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import adultRoutes from '../routes/adult.routes';
import AdultUser from '../models/AdultUser';

const ADULT_JWT_SECRET = process.env.ADULT_JWT_SECRET || 'adult_secret';

const app = express();
app.use(express.json());
app.use('/api/adult', adultRoutes);

describe('PATCH /api/adult/providers/:id/status authorization', () => {
  let mongoServer: MongoMemoryServer;
  let regularUserToken: string;
  let providerToken: string;
  let adminToken: string;
  let targetProviderId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const regularUser = await AdultUser.create({
      email: 'user@test.com',
      passwordHash: 'hash',
      role: 'user',
      username: 'reguser',
      displayName: 'Regular User',
      dateOfBirth: new Date('1995-01-01'),
      country: 'NG',
    });

    const targetProvider = await AdultUser.create({
      email: 'provider@test.com',
      passwordHash: 'hash',
      role: 'provider',
      username: 'testprovider',
      displayName: 'Test Provider',
      dateOfBirth: new Date('1995-01-01'),
      country: 'NG',
      providerProfile: {
        stageName: 'TestStage',
        verificationStatus: 'pending',
      },
    });
    targetProviderId = targetProvider._id.toString();

    const adminUser = await AdultUser.create({
      email: 'admin@test.com',
      passwordHash: 'hash',
      role: 'admin',
      isAdmin: true,
      username: 'adminuser',
      displayName: 'Admin User',
      dateOfBirth: new Date('1995-01-01'),
      country: 'NG',
    });

    regularUserToken = jwt.sign({ sub: regularUser._id.toString() }, ADULT_JWT_SECRET);
    providerToken = jwt.sign({ sub: targetProviderId }, ADULT_JWT_SECRET);
    adminToken = jwt.sign({ sub: adminUser._id.toString() }, ADULT_JWT_SECRET);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${targetProviderId}/status`)
      .send({ status: 'approved' });

    expect(res.status).toBe(401);
  });

  it('should return 403 when accessed by a regular user', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${targetProviderId}/status`)
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should return 403 when accessed by another provider without admin rights', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${targetProviderId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow admin to update provider status', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${targetProviderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedProvider = await AdultUser.findById(targetProviderId);
    expect(updatedProvider?.providerProfile?.verificationStatus).toBe('approved');
  });
});

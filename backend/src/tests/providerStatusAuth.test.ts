import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

describe('Provider Status Update Authorization Security Test', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let userToken: string;
  let adminToken: string;
  let providerId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Target provider whose status will be updated
    const provider = new AdultUser({
      email: 'target_provider@test.com',
      passwordHash: 'password123',
      username: 'targetprovider',
      displayName: 'Target Provider',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
      providerProfile: {
        stageName: 'TargetStage',
        verificationStatus: 'pending',
      },
    });
    await provider.save();
    providerId = provider._id.toString();

    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Regular adult user
    const member = new AdultUser({
      email: 'normal_user@test.com',
      passwordHash: 'password123',
      username: 'normaluser',
      displayName: 'Normal User',
      dateOfBirth: new Date('2000-01-01'),
      country: 'Nigeria',
      role: 'user',
    });
    await member.save();

    userToken = jwt.sign({ sub: member._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Admin user
    const admin = new AdultUser({
      email: 'admin_user@test.com',
      passwordHash: 'password123',
      username: 'adminuser',
      displayName: 'Admin User',
      dateOfBirth: new Date('1990-01-01'),
      country: 'Nigeria',
      role: 'admin',
      isAdmin: true,
    });
    await admin.save();

    adminToken = jwt.sign({ sub: admin._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('rejects status update from a non-admin user with 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'approved' })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('rejects status update from another provider without admin access with 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'approved' })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('allows status update from an authorized admin user', async () => {
    const res = await request(app)
      .patch(`/api/adult/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updatedProvider = await AdultUser.findById(providerId);
    expect(updatedProvider?.providerProfile?.verificationStatus).toBe('approved');
  });
});

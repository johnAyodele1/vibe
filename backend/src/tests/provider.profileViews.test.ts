import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app';
import AdultUser from '../models/AdultUser';
import { setRedisClientForTesting, resetMemoryProfileViewsForTesting } from '../controllers/adultProviders.controller';

describe('Provider Profile Views & Dashboard API Tests', () => {
  let mongoServer: MongoMemoryServer;
  let providerId: string;
  let viewerAId: string;
  let viewerBId: string;

  let providerToken: string;
  let viewerAToken: string;
  let viewerBToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create provider user with required schema fields
    const provider = await AdultUser.create({
      username: 'provider_test',
      email: 'provider@test.com',
      passwordHash: 'hashedpassword123',
      displayName: 'Test Star',
      country: 'Nigeria',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      isVerified: true,
      providerProfile: {
        stageName: 'Test Star',
        profileViews: 0,
        onboarding: { isComplete: true, currentStep: 7, completedSteps: [1,2,3,4,5,6] }
      }
    });
    providerId = provider._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create viewer A user
    const viewerA = await AdultUser.create({
      username: 'viewer_a',
      email: 'viewera@test.com',
      passwordHash: 'hashedpassword123',
      displayName: 'Viewer A',
      country: 'Nigeria',
      dateOfBirth: new Date('1998-05-10'),
      role: 'user',
      isVerified: true
    });
    viewerAId = viewerA._id.toString();
    viewerAToken = jwt.sign({ sub: viewerAId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create viewer B user
    const viewerB = await AdultUser.create({
      username: 'viewer_b',
      email: 'viewerb@test.com',
      passwordHash: 'hashedpassword123',
      displayName: 'Viewer B',
      country: 'Nigeria',
      dateOfBirth: new Date('1997-09-20'),
      role: 'user',
      isVerified: true
    });
    viewerBId = viewerB._id.toString();
    viewerBToken = jwt.sign({ sub: viewerBId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(() => {
    setRedisClientForTesting(null);
    resetMemoryProfileViewsForTesting();
  });

  it('Test A — New viewer increments count (0 -> 1)', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 0 } });

    const res = await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    expect(res.status).toBe(200);

    const updatedProvider = await AdultUser.findById(providerId).lean();
    expect(updatedProvider?.providerProfile?.profileViews).toBe(1);
  });

  it('Test B — Same viewer within one hour does not increment twice (1 -> 1)', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 0 } });

    // First view by viewer A
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    const midProvider = await AdultUser.findById(providerId).lean();
    expect(midProvider?.providerProfile?.profileViews).toBe(1);

    // Second view by viewer A
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    const finalProvider = await AdultUser.findById(providerId).lean();
    expect(finalProvider?.providerProfile?.profileViews).toBe(1);
  });

  it('Test C — Different viewer increments (1 -> 2)', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 0 } });

    // View by viewer A
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    // View by viewer B
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerBToken}`);

    const updatedProvider = await AdultUser.findById(providerId).lean();
    expect(updatedProvider?.providerProfile?.profileViews).toBe(2);
  });

  it('Test D — Provider viewing own profile does not increment', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 10 } });

    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${providerToken}`);

    const updatedProvider = await AdultUser.findById(providerId).lean();
    expect(updatedProvider?.providerProfile?.profileViews).toBe(10);
  });

  it('Test E — Redis failure falls back to memory and increments count', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 5 } });

    // Mock Redis client that throws error on set and provides dummy smembers
    const mockFailingRedis = {
      set: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
      smembers: jest.fn().mockResolvedValue([]),
    };
    setRedisClientForTesting(mockFailingRedis);

    // View by viewer A
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    const updatedProvider = await AdultUser.findById(providerId).lean();
    expect(updatedProvider?.providerProfile?.profileViews).toBe(6);

    // Repeated view by viewer A via memory fallback
    await request(app)
      .get(`/api/v1/adult/providers/${providerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    const finalProvider = await AdultUser.findById(providerId).lean();
    expect(finalProvider?.providerProfile?.profileViews).toBe(6);
  });

  it('Test F — Dashboard returns persisted count', async () => {
    await AdultUser.updateOne({ _id: providerId }, { $set: { 'providerProfile.profileViews': 42 } });

    const res = await request(app)
      .get('/api/v1/adult/providers/me/dashboard')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stats.profileViews).toBe(42);
  });
});

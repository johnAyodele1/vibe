import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app';
import AdultUser from '../models/AdultUser';
import ProviderSubscription from '../models/ProviderSubscription';

describe('Provider subscriptions API', () => {
  let mongoServer: MongoMemoryServer;
  let providerId: string;
  let memberId: string;
  let providerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const provider = await AdultUser.create({
      username: 'subscription_provider',
      email: 'subscription-provider@test.com',
      passwordHash: 'hashedpassword123',
      displayName: 'Subscription Provider',
      country: 'Nigeria',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      status: 'active',
      isVerified: true,
      providerProfile: {
        stageName: 'Subscription Provider',
        onboarding: { isComplete: true, currentStep: 7, completedSteps: [1, 2, 3, 4, 5, 6] },
      },
    });

    const member = await AdultUser.create({
      username: 'subscription_member',
      email: 'subscription-member@test.com',
      passwordHash: 'hashedpassword123',
      displayName: 'Subscription Member',
      country: 'Nigeria',
      dateOfBirth: new Date('1998-05-10'),
      role: 'user',
      status: 'active',
      isVerified: true,
    });

    providerId = provider._id.toString();
    memberId = member._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await ProviderSubscription.deleteMany({});
  });

  it('allows a member to follow and unfollow a provider idempotently', async () => {
    const follow = await request(app)
      .post(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(follow.body.success).toBe(true);
    expect(follow.body.data.isFollowing).toBe(true);

    const duplicateFollow = await request(app)
      .post(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(duplicateFollow.body.data.isFollowing).toBe(true);
    expect(await ProviderSubscription.countDocuments({ providerId, subscriberId: memberId, isActive: true })).toBe(1);

    const status = await request(app)
      .get(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(status.body.data.isFollowing).toBe(true);

    await request(app)
      .delete(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const afterUnfollow = await request(app)
      .get(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(afterUnfollow.body.data.isFollowing).toBe(false);
    expect(await ProviderSubscription.countDocuments({ providerId, subscriberId: memberId, isActive: true })).toBe(0);
  });

  it('reports active subscribers from persisted subscriptions', async () => {
    await ProviderSubscription.create({
      providerId,
      subscriberId: memberId,
      isActive: true,
    });

    const res = await request(app)
      .get('/api/v1/adult/providers/me/subscribers')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.activeSubs).toBe(1);
  });

  it('prevents a provider from following themselves', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/providers/${providerId}/subscription`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(400);

    expect(res.body.message).toBe('You cannot follow yourself');
  });
});

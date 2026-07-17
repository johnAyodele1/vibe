import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

describe('Provider Onboarding & Profile API', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a provider user
    const provider = new AdultUser({
      email: 'provider@onboard.com',
      passwordHash: 'password123',
      username: 'onboardprovider',
      displayName: 'Lucia Rose',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
    });
    await provider.save();
    providerId = provider._id.toString();

    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a regular member user
    const member = new AdultUser({
      email: 'member@onboard.com',
      passwordHash: 'password123',
      username: 'onboardmember',
      displayName: 'Simple Member',
      dateOfBirth: new Date('2000-01-01'),
      role: 'user',
      country: 'Nigeria',
    });
    await member.save();

    memberToken = jwt.sign({ sub: member._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('new provider can fetch empty/default profile', async () => {
    const res = await request(app)
      .get('/api/v1/adult/providers/me')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('provider');
  });

  it('PUT /api/v1/adult/providers/me/profile updates bio and stageName', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/profile')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        stageName: 'Lucia Gold',
        bio: 'Passionate and elegant provider.',
        dateOfBirth: '1995-05-15',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.providerProfile.stageName).toBe('Lucia Gold');
    expect(res.body.data.user.bio).toBe('Passionate and elegant provider.');
  });

  it('PUT /api/v1/adult/providers/me/profile rejects DOB under 18', async () => {
    // Current year - 10
    const underageDate = new Date();
    underageDate.setFullYear(underageDate.getFullYear() - 10);

    await request(app)
      .put('/api/v1/adult/providers/me/profile')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        dateOfBirth: underageDate.toISOString().split('T')[0],
      })
      .expect(400);
  });

  it('PUT /api/v1/adult/providers/me/services updates servicesOffered', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        servicesOffered: ['live_cam', 'video_calls'],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.providerProfile.servicesOffered).toContain('live_cam');
  });

  it('PUT /api/v1/adult/providers/me/pricing sets rates and tip menu', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/pricing')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        perMinuteRate: 3.99,
        tonightRate: 150,
        tipMenu: [
          { amount: 50, action: 'Send custom photo' },
          { amount: 100, action: 'Shoutout' },
        ],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.providerProfile.pricePerMinute).toBe(3.99);
    expect(res.body.data.user.providerProfile.tonightRate).toBe(150);
    expect(res.body.data.user.providerProfile.tipMenu.length).toBe(2);
  });

  it('PUT /api/v1/adult/providers/me/pricing rejects perMinuteRate below 1.99', async () => {
    await request(app)
      .put('/api/v1/adult/providers/me/pricing')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        perMinuteRate: 1.50,
      })
      .expect(400);
  });

  it('PUT /api/v1/adult/providers/me/location sets country, state, city', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/location')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        country: { code: 'NG', name: 'Nigeria' },
        state: { code: 'LA', name: 'Lagos' },
        city: { name: 'Ikeja', lat: 6.596, lng: 3.336 },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.providerProfile.location.city.name).toBe('Ikeja');
  });

  it('PUT /api/v1/adult/providers/me/status sets isLive', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/status')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ isOnline: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.providerProfile.isLive).toBe(true);
  });

  it('member cannot access provider-only endpoints', async () => {
    await request(app)
      .put('/api/v1/adult/providers/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ stageName: 'Fake Name' })
      .expect(403);
  });

  it('GET /api/v1/adult/media/presigned-url returns pre-signed and mock urls', async () => {
    const res = await request(app)
      .get('/api/v1/adult/media/presigned-url?type=image&filename=beauty.png')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.uploadUrl).toBeDefined();
    expect(res.body.publicUrl).toBeDefined();
  });
});

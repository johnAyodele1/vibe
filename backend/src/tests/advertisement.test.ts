import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import Advertisement from '../models/Advertisement';
import AdvertisementImpression from '../models/AdvertisementImpression';
import AdultUser from '../models/AdultUser';
import User from '../models/User';
import jwt from 'jsonwebtoken';

describe('In-Chat Advertisement System Tests', () => {
  let mongoServer: MongoMemoryServer;

  let normalUser: any;
  let providerUser: any;
  let adminUser: any;

  let userToken: string;
  let providerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test normal adult user
    normalUser = await AdultUser.create({
      email: 'normal_user@example.com',
      passwordHash: 'hashedpassword',
      username: 'normal_user',
      displayName: 'Normal User',
      role: 'user',
      dateOfBirth: new Date('1995-01-01'),
      country: 'Nigeria',
      ageVerified: true,
    });

    // Create test provider adult user
    providerUser = await AdultUser.create({
      email: 'provider_user@example.com',
      passwordHash: 'hashedpassword',
      username: 'provider_user',
      displayName: 'Provider User',
      role: 'provider',
      dateOfBirth: new Date('1995-01-01'),
      country: 'Nigeria',
      ageVerified: true,
      providerProfile: {
        stageName: 'Stage Provider',
        pricePerMinute: 20,
      },
    });

    // Create test admin adult user
    adminUser = await AdultUser.create({
      email: 'admin_user@example.com',
      passwordHash: 'hashedpassword',
      username: 'admin_user',
      displayName: 'Admin User',
      role: 'admin',
      isAdmin: true,
      dateOfBirth: new Date('1990-01-01'),
      country: 'Nigeria',
      ageVerified: true,
    });

    // Generate JWT tokens using Adult JWT secret
    const adultSecret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    userToken = jwt.sign({ sub: normalUser._id.toString(), role: 'user' }, adultSecret);
    providerToken = jwt.sign({ sub: providerUser._id.toString(), role: 'provider' }, adultSecret);
    adminToken = jwt.sign({ sub: adminUser._id.toString(), isAdmin: true }, adultSecret);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Advertisement.deleteMany({});
    await AdvertisementImpression.deleteMany({});
    await AdultUser.updateMany({}, { $set: { lastAdShownAt: null } });
    await User.updateMany({}, { $set: { lastAdShownAt: null } });
  });

  describe('Eligibility Endpoint (GET /api/v1/ads/eligible)', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/v1/ads/eligible');
      expect(res.status).toBe(401);
    });

    it('should return eligible active advertisement within campaign dates', async () => {
      const now = new Date();
      const ad = await Advertisement.create({
        title: 'Active Promo',
        description: 'Test promo',
        mediaType: 'image',
        mediaUrl: 'https://example.com/banner.jpg',
        clickUrl: 'https://example.com/click',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        campaignEndsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        displayDurationSeconds: 30,
        closeAfterSeconds: 15,
      });

      const res = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.advertisement).not.toBeNull();
      expect(res.body.data.advertisement.id).toBe(ad._id.toString());
      expect(res.body.data.advertisement.title).toBe('Active Promo');
      expect(res.body.data.advertisement.displayDurationSeconds).toBe(30);
      expect(res.body.data.advertisement.closeAfterSeconds).toBe(15);
    });

    it('should NOT return draft, scheduled, paused, or expired advertisements', async () => {
      const now = new Date();

      // Paused ad
      await Advertisement.create({
        title: 'Paused Promo',
        mediaType: 'image',
        mediaUrl: 'https://example.com/banner.jpg',
        targetAudience: 'both',
        status: 'paused',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // Scheduled ad (future start)
      await Advertisement.create({
        title: 'Scheduled Promo',
        mediaType: 'image',
        mediaUrl: 'https://example.com/banner.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        campaignEndsAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      });

      // Expired ad (past end)
      await Advertisement.create({
        title: 'Expired Promo',
        mediaType: 'image',
        mediaUrl: 'https://example.com/banner.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        campaignEndsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.advertisement).toBeNull();
    });

    it('should enforce strict role targeting between users and providers', async () => {
      const now = new Date();

      // User-only ad
      await Advertisement.create({
        title: 'User Special',
        mediaType: 'image',
        mediaUrl: 'https://example.com/user.jpg',
        targetAudience: 'user',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // Provider-only ad
      await Advertisement.create({
        title: 'Provider Special',
        mediaType: 'image',
        mediaUrl: 'https://example.com/provider.jpg',
        targetAudience: 'provider',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // Provider request -> gets Provider Special
      const providerRes = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(providerRes.status).toBe(200);
      expect(providerRes.body.data.advertisement.title).toBe('Provider Special');

      // User request -> gets User Special
      const userRes = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(userRes.status).toBe(200);
      expect(userRes.body.data.advertisement.title).toBe('User Special');
    });

    it('should enforce 2-hour server-authoritative cooldown per account', async () => {
      const now = new Date();
      const ad = await Advertisement.create({
        title: 'Cooldown Test Ad',
        mediaType: 'image',
        mediaUrl: 'https://example.com/test.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // First call -> returns ad
      const firstRes = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(firstRes.body.data.advertisement).not.toBeNull();

      // Second call immediately after -> returns null (cooldown active)
      const secondRes = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.advertisement).toBeNull();

      // Reset user lastAdShownAt to 2 hours and 1 minute ago
      await AdultUser.updateOne(
        { _id: normalUser._id },
        { $set: { lastAdShownAt: new Date(Date.now() - (2 * 60 * 60 * 1000 + 60 * 1000)) } }
      );

      // Third call -> eligible again!
      const thirdRes = await request(app)
        .get('/api/v1/ads/eligible')
        .set('Authorization', `Bearer ${userToken}`);

      expect(thirdRes.status).toBe(200);
      expect(thirdRes.body.data.advertisement).not.toBeNull();
      expect(thirdRes.body.data.advertisement.id).toBe(ad._id.toString());
    });

    it('should handle 10 concurrent requests atomically resulting in exactly 1 ad delivery', async () => {
      const now = new Date();
      await Advertisement.create({
        title: 'Concurrent Test Ad',
        mediaType: 'image',
        mediaUrl: 'https://example.com/concurrent.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // Dispatch 10 simultaneous requests
      const requests = Array.from({ length: 10 }).map(() =>
        request(app)
          .get('/api/v1/ads/eligible')
          .set('Authorization', `Bearer ${userToken}`)
      );

      const responses = await Promise.all(requests);

      // Verify responses: exactly 1 response has non-null advertisement
      const adsReturned = responses.filter(r => r.body.data?.advertisement !== null);
      const nullsReturned = responses.filter(r => r.body.data?.advertisement === null);

      expect(adsReturned.length).toBe(1);
      expect(nullsReturned.length).toBe(9);

      // Verify database record count: exactly 1 impression was persisted
      const totalImpressions = await AdvertisementImpression.countDocuments({ userId: normalUser._id });
      expect(totalImpressions).toBe(1);
    });
  });

  describe('Impression & Click Tracking', () => {
    it('should record impression for valid active ad', async () => {
      const now = new Date();
      const ad = await Advertisement.create({
        title: 'Impression Ad',
        mediaType: 'image',
        mediaUrl: 'https://example.com/test.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      const res = await request(app)
        .post(`/api/v1/ads/${ad._id}/impression`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.impression.advertisementId).toBe(ad._id.toString());

      const count = await AdvertisementImpression.countDocuments({
        advertisementId: ad._id,
        userId: normalUser._id,
      });
      expect(count).toBe(1);
    });

    it('should reject impression for inactive or invalid advertisement', async () => {
      const now = new Date();
      const pausedAd = await Advertisement.create({
        title: 'Paused Ad',
        mediaType: 'image',
        mediaUrl: 'https://example.com/test.jpg',
        targetAudience: 'both',
        status: 'paused',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      const res = await request(app)
        .post(`/api/v1/ads/${pausedAd._id}/impression`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should record click event', async () => {
      const now = new Date();
      const ad = await Advertisement.create({
        title: 'Click Ad',
        mediaType: 'image',
        mediaUrl: 'https://example.com/test.jpg',
        targetAudience: 'both',
        status: 'active',
        campaignStartsAt: new Date(now.getTime() - 10000),
        campaignEndsAt: new Date(now.getTime() + 100000),
      });

      // Record impression first
      await AdvertisementImpression.create({
        advertisementId: ad._id,
        userId: normalUser._id,
        shownAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/ads/${ad._id}/click`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const impression = await AdvertisementImpression.findOne({
        advertisementId: ad._id,
        userId: normalUser._id,
      });
      expect(impression?.clickedAt).toBeDefined();
    });
  });

  describe('Admin Operations (CRUD & Authorization)', () => {
    it('should allow admin to create advertisement', async () => {
      const now = new Date();
      const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Created Campaign',
          description: 'Created by admin test',
          mediaType: 'image',
          mediaUrl: 'https://example.com/banner.jpg',
          clickUrl: 'https://example.com',
          targetAudience: 'both',
          status: 'active',
          campaignStartsAt: now.toISOString(),
          campaignEndsAt: endsAt.toISOString(),
          displayDurationSeconds: 30,
          closeAfterSeconds: 15,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.advertisement.title).toBe('Admin Created Campaign');
    });

    it('should reject clickUrl with invalid protocol (e.g. javascript: or ftp:)', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Unsafe Link Ad',
          mediaType: 'image',
          mediaUrl: 'https://example.com/banner.jpg',
          clickUrl: 'javascript:alert(1)',
          campaignStartsAt: now.toISOString(),
          campaignEndsAt: new Date(now.getTime() + 100000).toISOString(),
          displayDurationSeconds: 30,
          closeAfterSeconds: 15,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('HTTP or HTTPS protocol');
    });

    it('should reject admin ad creation with invalid timings or dates', async () => {
      const now = new Date();

      // Invalid dates: start > end
      const res1 = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Invalid Dates Ad',
          mediaType: 'image',
          mediaUrl: 'https://example.com/banner.jpg',
          campaignStartsAt: new Date(now.getTime() + 100000).toISOString(),
          campaignEndsAt: now.toISOString(),
          displayDurationSeconds: 30,
          closeAfterSeconds: 15,
        });

      expect(res1.status).toBe(400);

      // Invalid timings: closeAfterSeconds > displayDurationSeconds
      const res2 = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Invalid Timings Ad',
          mediaType: 'image',
          mediaUrl: 'https://example.com/banner.jpg',
          campaignStartsAt: now.toISOString(),
          campaignEndsAt: new Date(now.getTime() + 100000).toISOString(),
          displayDurationSeconds: 10,
          closeAfterSeconds: 15,
        });

      expect(res2.status).toBe(400);
      expect(res2.body.message).toContain('Close delay cannot exceed display duration');
    });

    it('should reject non-admin users from creating or modifying ads', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Unauthorized Ad',
          mediaType: 'image',
          mediaUrl: 'https://example.com/banner.jpg',
          campaignStartsAt: now.toISOString(),
          campaignEndsAt: new Date(now.getTime() + 100000).toISOString(),
          displayDurationSeconds: 30,
          closeAfterSeconds: 15,
        });

      expect(res.status).toBe(403);
    });

    it('should allow admin to update and soft-delete advertisement', async () => {
      const now = new Date();
      const ad = await Advertisement.create({
        title: 'Original Title',
        mediaType: 'image',
        mediaUrl: 'https://example.com/orig.jpg',
        targetAudience: 'both',
        status: 'draft',
        campaignStartsAt: now,
        campaignEndsAt: new Date(now.getTime() + 100000),
        displayDurationSeconds: 30,
        closeAfterSeconds: 15,
      });

      // Update
      const updateRes = await request(app)
        .put(`/api/v1/admin/ads/${ad._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated Title',
          status: 'active',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.advertisement.title).toBe('Updated Title');
      expect(updateRes.body.data.advertisement.status).toBe('active');

      // Delete (Archive)
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/ads/${ad._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);

      const archivedAd = await Advertisement.findById(ad._id);
      expect(archivedAd?.isArchived).toBe(true);
    });
  });
});

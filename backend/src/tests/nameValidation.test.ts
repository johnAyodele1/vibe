import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AppConfig from '../models/AppConfig';
import { DEFAULT_OFFICIAL_CONFIG } from '../controllers/officialSupport.controller';

describe('Name Validation & Official Channels Configuration Regression Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '7.0.14' }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await AppConfig.deleteMany({});
  });

  describe('Registration Username Validation', () => {
    it('accepts normal valid username', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'validuser@test.com',
          password: 'Password123!',
          username: 'John_Doe_99',
          displayName: 'John Doe',
          dateOfBirth: '1995-05-15',
          role: 'user',
          country: 'United States',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('John_Doe_99');
    });

    it('rejects username containing emoji', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'emojiuser@test.com',
          password: 'Password123!',
          username: 'JohnDoe😀',
          displayName: 'John Doe',
          dateOfBirth: '1995-05-15',
          role: 'user',
          country: 'United States',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects emoji-only username', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'emojionly@test.com',
          password: 'Password123!',
          username: '👑👑👑',
          displayName: 'Crown',
          dateOfBirth: '1995-05-15',
          role: 'user',
          country: 'United States',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects username containing avatar/emoticon unicode characters', async () => {
      const res = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'avataruser@test.com',
          password: 'Password123!',
          username: 'CoolUser🔞',
          displayName: 'Cool User',
          dateOfBirth: '1995-05-15',
          role: 'user',
          country: 'United States',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Provider Application & Profile Stage Name Validation', () => {
    let providerToken: string;

    beforeEach(async () => {
      const regRes = await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'provider@test.com',
          password: 'Password123!',
          username: 'valid_provider_user',
          displayName: 'Provider User',
          dateOfBirth: '1992-08-20',
          role: 'user',
          country: 'United States',
        });

      providerToken = regRes.body.data.accessToken;
    });

    it('accepts normal valid stage name', async () => {
      const res = await request(app)
        .post('/api/adult/providers/apply')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Lucia Rose',
          categories: ['live_cam'],
          contentTags: ['glamour'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects stage name containing emoji on application', async () => {
      const res = await request(app)
        .post('/api/adult/providers/apply')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Lucia Rose 👑',
          categories: ['live_cam'],
          contentTags: ['glamour'],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects stage name containing emoji on profile update', async () => {
      // First apply with valid stage name
      await request(app)
        .post('/api/adult/providers/apply')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Valid Stage Name',
          categories: ['live_cam'],
          contentTags: ['glamour'],
        });

      const res = await request(app)
        .patch('/api/adult/providers/profile')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Lucia 💃🏻',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('allows valid Unicode characters with accents in names', async () => {
      const res = await request(app)
        .post('/api/adult/providers/apply')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Renée Müller-François',
          categories: ['live_cam'],
          contentTags: ['glamour'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Official Channels Configuration Update (AppConfig Mixed Value)', () => {
    let adminToken: string;

    beforeEach(async () => {
      const admin = await AdultUser.create({
        email: 'admin@vibe.com',
        passwordHash: 'hashed_pass',
        username: 'admin_official',
        displayName: 'Admin User',
        dateOfBirth: new Date('1990-01-01'),
        role: 'admin',
        isAdmin: true,
        country: 'United States',
      });

      const jwt = require('jsonwebtoken');
      adminToken = jwt.sign(
        { userId: admin._id.toString(), role: 'admin', isAdmin: true },
        process.env.JWT_SECRET || 'fallback_secret'
      );
    });

    it('successfully updates official channel configuration badge and badgeType without CastError', async () => {
      const res = await request(app)
        .put('/api/v1/admin/official-channels/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          notifications: {
            avatarUrl: '/icons/icon-192x192.png',
            badge: 'official',
            badgeType: 'gold',
            enabled: true,
          },
          support: {
            avatarUrl: '/icons/icon-192x192.png',
            badge: 'official',
            badgeType: 'gold',
            enabled: true,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.badgeType).toBe('gold');
      expect(res.body.data.support.badgeType).toBe('gold');
    });
  });
});

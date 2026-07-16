process.env.CLOUDINARY_URL = 'cloudinary://123456789012345:dummy_secret@dummy_cloud';

// Mock Cloudinary BEFORE importing controllers/routes
jest.mock('cloudinary', () => {
  const mockUploadStream = jest.fn((options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    return {
      write: jest.fn(),
      end: jest.fn().mockImplementation(() => {
        if (cb) {
          cb(null, {
            secure_url: 'https://res.cloudinary.com/dummy-url.jpg',
            public_id: 'dummy_public_id',
          });
        }
      }),
    };
  });

  const cloudinaryMock = {
    config: jest.fn(),
    uploader: {
      upload_stream: mockUploadStream,
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  };

  return {
    __esModule: true,
    v2: cloudinaryMock,
    default: {
      v2: cloudinaryMock,
    },
  };
});

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import express from 'express';
import adultRoutes from '../routes/adult.routes';
import { errorHandler } from '../middleware/errorHandler';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import CreditTransaction from '../models/CreditTransaction';

let mongoServer: MongoMemoryReplSet;
const app = express();
app.use(express.json());
app.use('/api/adult', adultRoutes);
app.use(errorHandler);

beforeAll(async () => {
  // Start MongoMemoryReplSet to support transactions
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1 }
  });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

import { v2 as cloudinary } from 'cloudinary';

beforeEach(() => {
  // Reset mock implementation on each test because resetMocks: true is set in jest.config.js
  (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    return {
      write: jest.fn(),
      end: jest.fn().mockImplementation(() => {
        if (cb) {
          cb(null, {
            secure_url: 'https://res.cloudinary.com/dummy-url.jpg',
            public_id: 'dummy_public_id',
          });
        }
      }),
    };
  });
});

describe('Adult Zone Backend Production Tests', () => {
  let userToken: string;
  let providerToken: string;
  let userId: string;
  let providerId: string;

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

    it('should verify email and return tokens for user', async () => {
      const user = await AdultUser.findOne({ email: 'test@adult.com' });
      const res = await request(app)
        .get(`/api/adult/auth/verify-email?token=${user?.emailVerificationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      userToken = res.body.data.accessToken;
      userId = res.body.data.user.id;
    });

    it('should register and verify a provider', async () => {
      // Register provider
      await request(app)
        .post('/api/adult/auth/register')
        .send({
          email: 'provider@adult.com',
          password: 'Password123!@#',
          username: 'provideruser',
          displayName: 'Provider User',
          dateOfBirth: '1985-05-05',
          role: 'provider',
          country: 'US',
        });

      const provider = await AdultUser.findOne({ email: 'provider@adult.com' });
      const res = await request(app)
        .get(`/api/adult/auth/verify-email?token=${provider?.emailVerificationToken}`);

      expect(res.status).toBe(200);
      providerToken = res.body.data.accessToken;
      providerId = res.body.data.user.id;
    });
  });

  describe('Credits, VIP Subscriptions & Tipping', () => {
    it('should verify age before tipping', async () => {
        await AdultUser.findByIdAndUpdate(userId, { credits: 1000 });

        const res = await request(app)
          .post('/api/adult/credits/tip')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ recipientId: providerId, amount: 10 });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('AGE_NOT_VERIFIED');
    });

    it('should verify age successfully', async () => {
        const res = await request(app)
          .post('/api/adult/auth/verify-age')
          .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
    });

    it('should tip successfully after age verification', async () => {
        const res = await request(app)
          .post('/api/adult/credits/tip')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ recipientId: providerId, amount: 50 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const updatedUser = await AdultUser.findById(userId);
        expect(updatedUser?.credits).toBe(950);

        const updatedProvider = await AdultUser.findById(providerId);
        expect(updatedProvider?.credits).toBe(50);
    });

    it('should subscribe to a VIP Tier successfully using credits', async () => {
      const res = await request(app)
        .post('/api/adult/credits/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tier: 'platinum' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscriptionTier).toBe('platinum');

      const updatedUser = await AdultUser.findById(userId);
      expect(updatedUser?.credits).toBe(700); // 950 - 250
    });
  });

  describe('Provider Profile Updates & Settings', () => {
    it('should allow provider to update their profile and rates', async () => {
      const res = await request(app)
        .patch('/api/adult/providers/profile')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          stageName: 'Lucia Rose',
          bio: 'Beautiful provider bio',
          country: 'ES',
          pricePerMinute: 10,
          videoCallPrice: 20,
          audioCallPrice: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.providerProfile.stageName).toBe('Lucia Rose');
      expect(res.body.data.user.providerProfile.videoCallPrice).toBe(20);
    });

    it('should reject non-providers updating profiles', async () => {
      const res = await request(app)
        .patch('/api/adult/providers/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ stageName: 'Fake Name' });

      expect(res.status).toBe(403);
    });
  });

  describe('Cloudinary Media Uploads', () => {
    it('should upload photo to Cloudinary and set as profilePhoto', async () => {
      const res = await request(app)
        .post('/api/adult/upload/photo?setProfilePhoto=true')
        .set('Authorization', `Bearer ${providerToken}`)
        .attach('photo', Buffer.from('dummy image content'), 'test.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('cloudinary');

      const updatedProvider = await AdultUser.findById(providerId);
      expect(updatedProvider?.profilePhoto).toBe('https://res.cloudinary.com/dummy-url.jpg');
    });

    it('should upload video to Cloudinary', async () => {
      const res = await request(app)
        .post('/api/adult/upload/video')
        .set('Authorization', `Bearer ${providerToken}`)
        .attach('video', Buffer.from('dummy video content'), 'test.mp4');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('cloudinary');
    });
  });

  describe('Media Locking & 15% Pricing Markup', () => {
    let messageId: string;

    beforeEach(async () => {
      // Create a locked message from provider to user
      const message = new AdultMessage({
        conversationId: [userId, providerId].sort().join('_'),
        senderId: providerId,
        receiverId: userId,
        content: 'Naughty Pic',
        messageType: 'image',
        mediaUrl: 'https://cloudinary.com/hidden.jpg',
        unlockCost: 20, // Base provider cost
        mediaBlurred: true,
      });
      await message.save();
      messageId = message._id.toString();
    });

    it('should charge user the marked-up cost (15% added) and credit provider base cost', async () => {
      // User starts with 700 credits
      // base cost = 20, markup = Math.ceil(20 * 1.15) = 23
      const res = await request(app)
        .post(`/api/adult/messages/${messageId}/unlock`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await AdultUser.findById(userId);
      expect(updatedUser?.credits).toBe(677); // 700 - 23

      const updatedProvider = await AdultUser.findById(providerId);
      expect(updatedProvider?.credits).toBe(70); // 50 (from tip) + 20 (base message unlock)

      // Verify transaction records exist
      const transactions = await CreditTransaction.find({ relatedUserId: { $exists: true } });
      expect(transactions.length).toBeGreaterThan(0);
    });
  });
});

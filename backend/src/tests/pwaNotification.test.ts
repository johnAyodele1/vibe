import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import PushSubscription from '../models/PushSubscription';
import AdultConversation from '../models/AdultConversation';
import AdultMessage from '../models/AdultMessage';
import jwt from 'jsonwebtoken';

describe('PWA Push Notifications & Provider Retention Tests', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let userId: string;
  let providerId: string;
  let providerToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a member
    const user = new AdultUser({
      email: 'buyer-push@test.com',
      passwordHash: 'password123',
      username: 'buyerpushuser',
      displayName: 'Test Member',
      dateOfBirth: new Date('1990-01-01'),
      role: 'user',
      country: 'USA',
      credits: 500,
    });
    await user.save();
    userId = user._id.toString();
    userToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a provider
    const provider = new AdultUser({
      email: 'provider-push@test.com',
      passwordHash: 'password123',
      username: 'providerpushuser',
      displayName: 'Test Provider',
      dateOfBirth: new Date('1992-01-01'),
      role: 'provider',
      country: 'NG',
      credits: 0,
      providerProfile: {
        stageName: 'Elena Rose',
        totalResponseCount: 0,
        totalResponseMinutes: 0
      }
    });
    await provider.save();
    providerId = provider._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Subscription endpoints', () => {
    it('POST /api/v1/adult/push/subscribe saves subscription to DB', async () => {
      const payload = {
        subscription: {
          endpoint: 'https://updates.push.com/mock-endpoint-123',
          keys: {
            p256dh: 'mock-p256dh',
            auth: 'mock-auth'
          }
        }
      };

      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(200);

      const sub = await PushSubscription.findOne({ userId });
      expect(sub).toBeDefined();
      expect(sub?.endpoint).toBe('https://updates.push.com/mock-endpoint-123');
      expect(sub?.keys.p256dh).toBe('mock-p256dh');
      expect(sub?.keys.auth).toBe('mock-auth');
      expect(sub?.accountType).toBe('member');
    });

    it('POST /api/v1/adult/push/subscribe upserts on same endpoint', async () => {
      const payload = {
        subscription: {
          endpoint: 'https://updates.push.com/mock-endpoint-123',
          keys: {
            p256dh: 'updated-p256dh',
            auth: 'updated-auth'
          }
        }
      };

      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(200);

      const subs = await PushSubscription.find({ userId });
      expect(subs.length).toBe(1);
      expect(subs[0].keys.p256dh).toBe('updated-p256dh');
    });

    it('DELETE /api/v1/adult/push/subscribe removes all user subscriptions', async () => {
      await request(app)
        .delete('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const subs = await PushSubscription.find({ userId });
      expect(subs.length).toBe(0);
    });
  });

  describe('Unread count and badging', () => {
    let conversationId: string;

    beforeEach(async () => {
      conversationId = [userId, providerId].sort().join('_');
      await AdultConversation.create({
        _id: conversationId,
        participants: [userId, providerId],
        participantProfiles: [
          { userId, displayName: 'Test Member', accountType: 'member' },
          { userId: providerId, displayName: 'Test Provider', accountType: 'provider' }
        ],
        unreadCounts: {
          [userId]: 2,
          [providerId]: 0
        }
      });
    });

    afterEach(async () => {
      await AdultConversation.deleteMany({});
      await AdultMessage.deleteMany({});
    });

    it('GET /api/v1/adult/sext/conversations/unread-count returns correct unread count', async () => {
      const res = await request(app)
        .get('/api/v1/adult/sext/conversations/unread-count')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(2);
    });
  });

  describe('Provider Response Time tracking', () => {
    let conversationId: string;

    beforeEach(async () => {
      conversationId = [userId, providerId].sort().join('_');
      await AdultConversation.create({
        _id: conversationId,
        participants: [userId, providerId],
        participantProfiles: [
          { userId, displayName: 'Test Member', accountType: 'member' },
          { userId: providerId, displayName: 'Test Provider', accountType: 'provider' }
        ],
        unreadCounts: {
          [userId]: 0,
          [providerId]: 0
        }
      });
    });

    afterEach(async () => {
      await AdultConversation.deleteMany({});
      await AdultMessage.deleteMany({});
    });

    it('tracks response time on reply', async () => {
      // 1. Send message from member to provider (unanswered)
      const unansweredMessage = new AdultMessage({
        conversationId,
        senderId: userId,
        receiverId: providerId,
        content: 'hello',
        messageType: 'text',
        createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      });
      await unansweredMessage.save();

      // 2. Provider replies to member
      await request(app)
        .post(`/api/v1/adult/sext/messages/${conversationId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          content: 'hello reply',
          type: 'text'
        })
        .expect(201);

      // Verify the unanswered message was marked as replied
      const updatedUnanswered = await AdultMessage.findById(unansweredMessage._id);
      expect(updatedUnanswered?.repliedAt).toBeDefined();
      expect(updatedUnanswered?.replyTimeMinutes).toBeGreaterThanOrEqual(9);

      // Verify provider rolling stats are incremented
      const updatedProvider = await AdultUser.findById(providerId);
      expect(updatedProvider?.providerProfile?.totalResponseCount).toBe(1);
      expect(updatedProvider?.providerProfile?.totalResponseMinutes).toBeGreaterThanOrEqual(9);
    });
  });
});

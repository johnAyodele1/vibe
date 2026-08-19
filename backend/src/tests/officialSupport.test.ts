import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

import app from '../app';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const ADULT_JWT_SECRET = process.env.ADULT_JWT_SECRET || 'adult_secret';

import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import AdultConversation from '../models/AdultConversation';
import OfficialNotification from '../models/OfficialNotification';
import OfficialNotificationRead from '../models/OfficialNotificationRead';
import Report from '../models/Report';

jest.setTimeout(60000);

describe('Official Notifications & Customer Support Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let memberId: string;
  let providerId: string;
  let adminToken: string;
  let memberToken: string;
  let providerToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const member = await AdultUser.create({
      username: 'member1',
      displayName: 'Member One',
      email: 'member1@test.com',
      passwordHash: 'hashedpass',
      country: 'US',
      dateOfBirth: new Date('1995-01-01'),
      role: 'user',
      credits: 1000,
      isAgeVerified: true,
    });
    memberId = member._id.toString();

    const provider = await AdultUser.create({
      username: 'provider1',
      displayName: 'Provider One',
      email: 'provider1@test.com',
      passwordHash: 'hashedpass',
      country: 'US',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      credits: 500,
      isAgeVerified: true,
      providerProfile: { stageName: 'StarProvider', tonightRate: 100 },
    });
    providerId = provider._id.toString();

    adminToken = jwt.sign({ userId: 'admin1', isAdmin: true }, JWT_SECRET);
    memberToken = jwt.sign({ sub: memberId }, ADULT_JWT_SECRET);
    providerToken = jwt.sign({ sub: providerId }, ADULT_JWT_SECRET);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await OfficialNotification.deleteMany({});
    await OfficialNotificationRead.deleteMany({});
    await AdultMessage.deleteMany({});
    await AdultConversation.deleteMany({});
    await Report.deleteMany({});
  });

  describe('Official Notifications', () => {
    it('allows admin to create notifications and enforces audience targeting', async () => {
      const res1 = await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Users Announcement',
          content: 'Hello members only',
          targetAudience: 'users',
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Providers Announcement',
          content: 'Hello providers only',
          targetAudience: 'providers',
        });
      expect(res2.status).toBe(201);

      // Member fetch
      const memberRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(memberRes.status).toBe(200);
      expect(memberRes.body.notifications.length).toBe(1);
      expect(memberRes.body.notifications[0].title).toBe('Users Announcement');

      // Provider fetch
      const providerRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(providerRes.status).toBe(200);
      expect(providerRes.body.notifications.length).toBe(1);
      expect(providerRes.body.notifications[0].title).toBe('Providers Announcement');
    });

    it('persists read state without deleting notification', async () => {
      const createRes = await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Notice', content: 'Notice body', targetAudience: 'both' });

      const notifId = createRes.body.notification._id;

      const markRead = await request(app)
        .put(`/api/v1/adult/official-notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(markRead.status).toBe(200);

      const fetchRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(fetchRes.body.notifications[0].isRead).toBe(true);
    });
  });

  describe('Official Customer Support', () => {
    it('sends first message, triggers automated welcome, and prevents duplicate welcome on retries', async () => {
      const res1 = await request(app)
        .post('/api/v1/adult/support/messages')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'I need assistance' });

      expect(res1.status).toBe(201);
      expect(res1.body.autoReply).not.toBeNull();
      expect(res1.body.autoReply.content).toContain('Thanks for contacting us');

      // Retry/second message
      const res2 = await request(app)
        .post('/api/v1/adult/support/messages')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Follow up question' });

      expect(res2.status).toBe(201);
      expect(res2.body.autoReply).toBeNull();
    });

    it('pinning order invariant: official notifications #0, official support #1 in conversations list', async () => {
      const res = await request(app)
        .get('/api/v1/adult/sext/conversations')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body[0].conversationId).toBe('official_notifications');
      expect(res.body[0].position).toBe(0);
      expect(res.body[1].conversationId).toBe(`support_${memberId}`);
      expect(res.body[1].position).toBe(1);
    });
  });

  describe('Paid Service Report -> Support Flow', () => {
    it('links report to support conversation with Chat with Issue tag idempotently', async () => {
      const serviceMsg = await AdultMessage.create({
        conversationId: `${memberId}_${providerId}`,
        senderId: providerId,
        receiverId: memberId,
        content: 'Service invoice',
        messageType: 'service_request',
        serviceRequest: {
          baseRate: 100,
          totalAmount: 100,
          status: 'paid',
        },
      });

      const reportRes1 = await request(app)
        .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ reason: 'Provider did not show up', details: 'Waited 30 mins' });

      expect(reportRes1.status).toBe(200);
      expect(reportRes1.body.supportConversationId).toBe(`support_${memberId}`);

      // Rapid duplicate report click
      const reportRes2 = await request(app)
        .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ reason: 'Provider did not show up', details: 'Waited 30 mins' });

      expect(reportRes2.status).toBe(200);
      expect(reportRes2.body.reportId).toBe(reportRes1.body.reportId);

      const supportConv = await AdultConversation.findById(`support_${memberId}`);
      expect((supportConv as any)?.supportMetadata?.tags).toContain('Chat with Issue');
    });
  });
});

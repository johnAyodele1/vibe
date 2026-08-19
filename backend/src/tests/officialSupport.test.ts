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

describe('Comprehensive Official Notifications & Customer Support Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let memberId: string;
  let providerId: string;
  let newMemberId: string;

  let adminToken: string;
  let memberToken: string;
  let providerToken: string;
  let newMemberToken: string;

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

  describe('1-3. Notification Audience Targeting & Isolation', () => {
    it('delivers user-only, provider-only, and both-targeted notifications exclusively to their audience', async () => {
      // 1. Target Users
      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Users Notice', content: 'For users', targetAudience: 'users' });

      // 2. Target Providers
      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Providers Notice', content: 'For providers', targetAudience: 'providers' });

      // 3. Target Both
      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Global Notice', content: 'For everyone', targetAudience: 'both' });

      // Member check
      const mRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(mRes.status).toBe(200);
      expect(mRes.body.notifications.map((n: any) => n.title)).toEqual(['Global Notice', 'Users Notice']);

      // Provider check
      const pRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(pRes.status).toBe(200);
      expect(pRes.body.notifications.map((n: any) => n.title)).toEqual(['Global Notice', 'Providers Notice']);
    });
  });

  describe('4. Unread Counts for Mixed Audience Notifications', () => {
    it('calculates unread counts strictly scoped to eligible audience notifications', async () => {
      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'User Notif 1', content: 'N1', targetAudience: 'users' });

      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'User Notif 2', content: 'N2', targetAudience: 'users' });

      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Provider Notif', content: 'P1', targetAudience: 'providers' });

      const convsRes = await request(app)
        .get('/api/v1/adult/sext/conversations')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(convsRes.status).toBe(200);
      const notifConv = convsRes.body.find((c: any) => c.conversationId === 'official_notifications');
      expect(notifConv.unreadCount).toBe(2);
    });
  });

  describe('5. New User Historical Notification Access', () => {
    it('allows a brand-new user to see historical notifications sent prior to registration', async () => {
      await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Historical Welcome', content: 'Sent yesterday', targetAudience: 'both' });

      // Create new user joining afterwards
      const newMember = await AdultUser.create({
        username: 'newmember',
        displayName: 'New Member',
        email: 'newmember@test.com',
        passwordHash: 'hashedpass',
        country: 'US',
        dateOfBirth: new Date('2000-01-01'),
        role: 'user',
        credits: 100,
        isAgeVerified: true,
      });
      newMemberId = newMember._id.toString();
      newMemberToken = jwt.sign({ sub: newMemberId }, ADULT_JWT_SECRET);

      const notifRes = await request(app)
        .get('/api/v1/adult/official-notifications')
        .set('Authorization', `Bearer ${newMemberToken}`);

      expect(notifRes.status).toBe(200);
      expect(notifRes.body.notifications.length).toBe(1);
      expect(notifRes.body.notifications[0].title).toBe('Historical Welcome');
    });
  });

  describe('6-7. Report & Concurrent Support Conversation Idempotency', () => {
    it('handles concurrent report requests and support creation cleanly without duplicates', async () => {
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

      // Concurrent report calls
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ reason: 'Dispute 1' }),
        request(app)
          .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ reason: 'Dispute 2' }),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.reportId).toBe(r2.body.reportId);

      const reports = await Report.find({ serviceRequestId: serviceMsg._id });
      expect(reports.length).toBe(1);

      const supportConvs = await AdultConversation.find({ _id: `support_${memberId}` });
      expect(supportConvs.length).toBe(1);
      expect(supportConvs[0].supportMetadata?.tags).toContain('Chat with Issue');
    });
  });

  describe('8-9. Automated Welcome Message Idempotency', () => {
    it('triggers automated welcome message exactly once on first contact and never again', async () => {
      const res1 = await request(app)
        .post('/api/v1/adult/support/messages')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Hello support' });

      expect(res1.status).toBe(201);
      expect(res1.body.autoReply).not.toBeNull();

      const res2 = await request(app)
        .post('/api/v1/adult/support/messages')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Follow up 1' });

      const res3 = await request(app)
        .post('/api/v1/adult/support/messages')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Follow up 2' });

      expect(res2.body.autoReply).toBeNull();
      expect(res3.body.autoReply).toBeNull();
    });
  });

  describe('10. Admin Route Authorization Enforcement', () => {
    it('rejects unauthorized users trying to access admin support or notification routes', async () => {
      const r1 = await request(app)
        .post('/api/admin/official-notifications')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Hack', content: 'Hack', targetAudience: 'both' });
      expect(r1.status).toBe(403);

      const r2 = await request(app)
        .get('/api/admin/support/conversations')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(r2.status).toBe(403);

      const r3 = await request(app)
        .put('/api/admin/official-channels/config')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ notifications: { badgeType: 'gold' } });
      expect(r3.status).toBe(403);
    });
  });

  describe('11. Support Channel Calling Prohibition', () => {
    it('strictly rejects any call initiation attempt directed at official support or notification channels', async () => {
      const callAttempt1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ conversationId: 'official_notifications', type: 'video' });

      expect(callAttempt1.status).toBe(400);
      expect(callAttempt1.body.error).toContain('Calling functionality is not available in official channels');

      const callAttempt2 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ conversationId: `support_${memberId}`, type: 'audio' });

      expect(callAttempt2.status).toBe(400);
      expect(callAttempt2.body.error).toContain('Calling functionality is not available in official channels');
    });
  });
});

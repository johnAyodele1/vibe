import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import AdultGift from '../models/AdultGift';
import AdultCall from '../models/AdultCall';
import jwt from 'jsonwebtoken';

describe('Private Messaging (Sext) Integration Tests', () => {
  let mongoServer: MongoMemoryReplSet;
  let memberToken: string;
  let providerToken: string;
  let strangerToken: string;
  let memberId: string;
  let providerId: string;
  let conversationId: string;
  let testGiftId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const member = new AdultUser({
      email: 'member@sext.com',
      passwordHash: 'password123',
      username: 'member_chat',
      displayName: 'Chat Member',
      dateOfBirth: new Date('1998-01-01'),
      role: 'user',
      country: 'Nigeria',
      credits: 200, // 200 credits initial
    });
    await member.save();
    memberId = member._id.toString();

    const provider = new AdultUser({
      email: 'provider@sext.com',
      passwordHash: 'password123',
      username: 'provider_chat',
      displayName: 'Stage Star',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
      credits: 0,
      providerProfile: {
        stageName: 'Lucia Star',
        categories: ['live_cam'],
        isLive: true,
        pricePerMinute: 5,
        videoCallPrice: 5,
        audioCallPrice: 2,
        tipMinimum: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        contentTags: [],
        rating: { average: 5, count: 1 },
      }
    });
    await provider.save();
    providerId = provider._id.toString();

    const stranger = new AdultUser({
      email: 'stranger@sext.com',
      passwordHash: 'password123',
      username: 'stranger_chat',
      displayName: 'Stranger User',
      dateOfBirth: new Date('1999-01-01'),
      role: 'user',
      country: 'USA',
    });
    await stranger.save();

    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    strangerToken = jwt.sign({ sub: stranger._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a default gift for testing
    const gift = new AdultGift({
      name: 'Test Rose',
      iconUrl: 'rose',
      creditCost: 15,
      category: 'romantic',
      isActive: true,
      sortOrder: 1
    });
    await gift.save();
    testGiftId = gift._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('member can start a conversation with a provider', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/conversations/${providerId}/start`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.conversationId).toBeDefined();
    conversationId = res.body.conversationId;
    expect(conversationId).toBe([memberId, providerId].sort().join('_'));
  });

  it('starting the same conversation twice returns the same conversationId', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/conversations/${providerId}/start`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(res.body.conversationId).toBe(conversationId);
  });

  it('sending a message saves to DB and is retrievable', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        content: 'Hello, are you available?',
        mediaType: 'text',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.content).toBe('Hello, are you available?');

    const listRes = await request(app)
      .get(`/api/v1/adult/sext/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].content).toBe('Hello, are you available?');
  });

  it('unread count increments when message is received', async () => {
    const conversationsRes = await request(app)
      .get('/api/v1/adult/sext/conversations')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(Array.isArray(conversationsRes.body)).toBe(true);
    const conv = conversationsRes.body.find((c: any) => c.conversationId === conversationId);
    expect(conv).toBeDefined();
    expect(conv.unreadCount).toBe(1);
  });

  it('PUT /read marks messages as read', async () => {
    await request(app)
      .put(`/api/v1/adult/sext/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    const conversationsRes = await request(app)
      .get('/api/v1/adult/sext/conversations')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    const conv = conversationsRes.body.find((c: any) => c.conversationId === conversationId);
    expect(conv.unreadCount).toBe(0);
  });

  it('paid media message shows isUnlocked: false before purchase', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'Exclusive view!',
        mediaUrl: 'https://ex.com/hot.png',
        mediaType: 'image',
        creditCost: 30,
      })
      .expect(201);

    const messageId = msgRes.body.id;

    const listRes = await request(app)
      .get(`/api/v1/adult/sext/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const lockedMsg = listRes.body.find((m: any) => m.id === messageId);
    expect(lockedMsg).toBeDefined();
    expect(lockedMsg.isUnlocked).toBe(false);
    expect(lockedMsg.mediaUrl).toBe(''); // Hidden url
  });

  it('unlock endpoint deducts credits and sets isUnlocked: true', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'Exclusive pic 2',
        mediaUrl: 'https://ex.com/pic.png',
        mediaType: 'image',
        creditCost: 40,
      })
      .expect(201);

    const messageId = msgRes.body.id;

    const unlockRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${messageId}/unlock`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(unlockRes.body.success).toBe(true);
    expect(unlockRes.body.mediaUrl).toBe('https://ex.com/pic.png');

    // Balance checks: cost 40 (no markup). Remaining: 200 - 40 = 160
    const walletRes = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(walletRes.body.creditBalance).toBe(160);
  });

  it('unlock with insufficient credits returns 402', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'VVIP video',
        mediaUrl: 'https://ex.com/vvip.mp4',
        mediaType: 'image',
        creditCost: 250, // client cost is 250, user has 160 remaining
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/adult/sext/messages/${msgRes.body.id}/unlock`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(402);
  });

  // Soft Deletes
  it('user can soft-delete their own message', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        content: 'To be deleted text',
        mediaType: 'text',
      })
      .expect(201);

    const messageId = msgRes.body.id;

    await request(app)
      .delete(`/api/v1/adult/sext/messages/${messageId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const listRes = await request(app)
      .get(`/api/v1/adult/sext/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const deletedMsg = listRes.body.find((m: any) => m.id === messageId);
    expect(deletedMsg.content).toBe('[Message deleted]');
  });

  it('user cannot soft-delete another user\'s message', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'Lucia text',
        mediaType: 'text',
      })
      .expect(201);

    await request(app)
      .delete(`/api/v1/adult/sext/messages/${msgRes.body.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  // Reactions
  it('toggles emoji reaction on message', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        content: 'Reaction post',
        mediaType: 'text',
      })
      .expect(201);

    const messageId = msgRes.body.id;

    // React with 🔥
    const reactRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${messageId}/react`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '🔥' })
      .expect(200);

    expect(reactRes.body.length).toBe(1);
    expect(reactRes.body[0].emoji).toBe('🔥');

    // Toggle reaction off
    const unreactRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${messageId}/react`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '🔥' })
      .expect(200);

    expect(unreactRes.body.length).toBe(0);
  });

  // Gifts
  it('GET /gifts/catalogue returns active gifts', async () => {
    const res = await request(app)
      .get('/api/v1/adult/gifts/catalogue')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('can send a gift and deduct credits', async () => {
    // Member balance before: 160 credits. Selected gift costs 15 credits.
    const res = await request(app)
      .post(`/api/v1/adult/sext/conversations/${conversationId}/send-gift`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        giftId: testGiftId,
        message: 'A nice rose for you!'
      })
      .expect(200);

    expect(res.body.message).toBeDefined();
    expect(res.body.senderNewBalance).toBe(145); // 160 - 15 = 145
  });

  // Photo Requests
  it('creates and fulfills photo request successfully', async () => {
    const reqRes = await request(app)
      .post(`/api/v1/adult/sext/conversations/${conversationId}/request-photo`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ note: 'Send me some lingerie pic' })
      .expect(201);

    expect(reqRes.body.photoRequest.status).toBe('pending');
    expect(reqRes.body.photoRequest.note).toBe('Send me some lingerie pic');

    const reqMsgId = reqRes.body.id;

    // Lucia fulfills
    const fulfillRes = await request(app)
      .put(`/api/v1/adult/sext/photo-requests/${reqMsgId}/fulfill`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        mediaUrl: 'https://ex.com/lingerie.png',
        isLocked: true,
        creditCost: 50
      })
      .expect(200);

    expect(fulfillRes.body.requestMessage.photoRequest.status).toBe('fulfilled');
    expect(fulfillRes.body.imageMessage).toBeDefined();
  });

  // Calls
  it('initiates and ends video call correctly', async () => {
    const callRes = await request(app)
      .post('/api/v1/adult/sext/calls/initiate')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        conversationId,
        type: 'video'
      })
      .expect(200);

    expect(callRes.body.callId).toBeDefined();
    expect(callRes.body.webrtcRoomId).toBeDefined();

    const callId = callRes.body.callId;

    // Accept call
    await request(app)
      .put(`/api/v1/adult/sext/calls/${callId}/accept`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    // End call
    const endRes = await request(app)
      .put(`/api/v1/adult/sext/calls/${callId}/end`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(endRes.body.durationSeconds).toBeDefined();
    expect(endRes.body.creditsDeducted).toBeDefined();
  });

  it('retrieves call history', async () => {
    const res = await request(app)
      .get('/api/v1/adult/sext/calls/history')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  describe('Zego Call Billing and Connection Rules', () => {
    let testCallId: string;

    beforeEach(async () => {
      // Create a fresh call for each test
      const callRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ conversationId, type: 'video' });
      testCallId = callRes.body.callId;
    });

    it('charges 0 credits when call was never accepted (status: ringing)', async () => {
      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(0);
      expect(res.body.wasBilled).toBe(false);
    });

    it('charges 0 credits when call was declined', async () => {
      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/decline`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(0);
      expect(res.body.wasBilled).toBe(false);
    });

    it('charges 0 credits when call was missed', async () => {
      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/missed`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(0);
      expect(res.body.wasBilled).toBe(false);
    });

    it('charges 0 credits when connected duration is under 10 seconds', async () => {
      // Accept call
      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/accept`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      // Modify startedAt to be 5 seconds ago
      await AdultCall.findByIdAndUpdate(testCallId, { startedAt: new Date(Date.now() - 5000) });

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(0);
      expect(res.body.wasBilled).toBe(false);
    });

    it('charges 0 credits when connected duration is exactly 9 seconds', async () => {
      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/accept`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      await AdultCall.findByIdAndUpdate(testCallId, { startedAt: new Date(Date.now() - 9000) });

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(0);
      expect(res.body.wasBilled).toBe(false);
    });

    it('charges for 1 minute when connected duration is 11 seconds', async () => {
      // Reset member credits to 200 for exact calculations
      await AdultUser.findByIdAndUpdate(memberId, { credits: 200 });

      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/accept`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      await AdultCall.findByIdAndUpdate(testCallId, { startedAt: new Date(Date.now() - 11000) });

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      // perMinuteRate is 5, no markup
      expect(res.body.creditsDeducted).toBe(5);
      expect(res.body.wasBilled).toBe(true);

      const member = await AdultUser.findById(memberId);
      expect(member?.credits).toBe(195); // 200 - 5 = 195
    });

    it('charges for 2 minutes when connected duration is 61 seconds', async () => {
      await AdultUser.findByIdAndUpdate(memberId, { credits: 200 });

      await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/accept`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      await AdultCall.findByIdAndUpdate(testCallId, { startedAt: new Date(Date.now() - 61000) });

      const res = await request(app)
        .put(`/api/v1/adult/sext/calls/${testCallId}/end`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.creditsDeducted).toBe(10); // 2 minutes * 5 = 10
      expect(res.body.wasBilled).toBe(true);
    });
  });

  describe('Gift Request & Service Charge Request Integration', () => {
    let serviceMsgId: string;
    let giftReqMsgId: string;

    it('provider can get their tonight rate', async () => {
      // Setup tonight rate on provider
      await AdultUser.findByIdAndUpdate(providerId, {
        'providerProfile.tonightRate': 150
      });

      const res = await request(app)
        .get('/api/v1/adult/providers/me/tonight-rate')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.tonightRate).toBe(150);
      expect(res.body.stageName).toBe('Lucia Star');
    });

    it('provider can send a gift request', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/sext/conversations/${conversationId}/gift-request`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          giftId: testGiftId,
          message: 'Can you send me this gift please?'
        })
        .expect(201);

      expect(res.body.mediaType).toBe('gift_request');
      expect(res.body.giftRequest).toBeDefined();
      expect(res.body.giftRequest.status).toBe('pending');
      expect(res.body.giftRequest.giftName).toBe('Test Rose');
      giftReqMsgId = res.body.id;
    });

    it('member can fulfill a gift request', async () => {
      await AdultUser.findByIdAndUpdate(memberId, { credits: 200 });

      const res = await request(app)
        .post(`/api/v1/adult/sext/gift-requests/${giftReqMsgId}/fulfill`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.giftRequest.status).toBe('fulfilled');

      const member = await AdultUser.findById(memberId);
      expect(member?.credits).toBe(185); // 200 - 15 (gift cost)
    });

    it('provider can send a service request', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/sext/conversations/${conversationId}/service-request`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          extras: [{ label: 'Travel Cost', amount: 30 }],
          note: 'Tonight booking'
        })
        .expect(201);

      expect(res.body.mediaType).toBe('service_request');
      expect(res.body.serviceRequest).toBeDefined();
      expect(res.body.serviceRequest.status).toBe('pending');
      expect(res.body.serviceRequest.totalAmount).toBe(180); // 150 base + 30 extra
      serviceMsgId = res.body.id;
    });

    it('member can pay for the service request', async () => {
      // Set credits to 150 first to ensure 402 (150 < 180)
      await AdultUser.findByIdAndUpdate(memberId, { credits: 150 });

      await request(app)
        .post(`/api/v1/adult/sext/service-requests/${serviceMsgId}/pay`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(402);

      // Increase credits to 300 to afford it
      await AdultUser.findByIdAndUpdate(memberId, { credits: 300 });

      const res = await request(app)
        .post(`/api/v1/adult/sext/service-requests/${serviceMsgId}/pay`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.serviceRequest.status).toBe('paid');

      const member = await AdultUser.findById(memberId);
      expect(member?.credits).toBe(120); // 300 - 180 = 120
    });

    it('member can confirm service completed', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/sext/service-requests/${serviceMsgId}/complete`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.serviceRequest.status).toBe('completed');
    });

    it('member can request service even if provider has 0 tonight rate, and provider fulfills with extras', async () => {
      // Set provider tonightRate to 0
      await AdultUser.findByIdAndUpdate(providerId, {
        'providerProfile.tonightRate': 0
      });

      // Member requests service
      const reqRes = await request(app)
        .post(`/api/v1/adult/sext/conversations/${conversationId}/request-service`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ note: 'Can you give me your rates?' })
        .expect(201);

      expect(reqRes.body.mediaType).toBe('request_service');
      expect(reqRes.body.serviceTonightRequest.status).toBe('pending');
      const serviceTonightReqId = reqRes.body.id;

      // Update provider tonightRate to 100 before provider fulfills
      await AdultUser.findByIdAndUpdate(providerId, {
        'providerProfile.tonightRate': 100
      });

      // Provider fulfills with extra charges: Hotel (50), Transport (20)
      const fulfillRes = await request(app)
        .put(`/api/v1/adult/sext/service-tonight-requests/${serviceTonightReqId}/fulfill`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          extras: [
            { label: 'Hotel', amount: 50 },
            { label: 'Transport', amount: 20 },
            { label: '  ', amount: 10 } // should be filtered out
          ],
          note: 'Rate details'
        })
        .expect(200);

      expect(fulfillRes.body.requestMessage.serviceTonightRequest.status).toBe('fulfilled');
      expect(fulfillRes.body.invoiceMessage).toBeDefined();
      const invoice = fulfillRes.body.invoiceMessage.serviceRequest;
      expect(invoice.baseRate).toBe(100);
      expect(invoice.extras).toHaveLength(2);
      expect(invoice.extras).toEqual([
        expect.objectContaining({ label: 'Hotel', amount: 50 }),
        expect.objectContaining({ label: 'Transport', amount: 20 })
      ]);
      expect(invoice.totalAmount).toBe(170); // 100 + 50 + 20 = 170

      // Second attempt to fulfill must return 409 conflict
      await request(app)
        .put(`/api/v1/adult/sext/service-tonight-requests/${serviceTonightReqId}/fulfill`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          extras: [{ label: 'Extra', amount: 10 }]
        })
        .expect(409);
    });
  });
});

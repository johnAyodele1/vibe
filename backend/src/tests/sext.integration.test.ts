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

    // Balance checks: cost 40 tipped: 40 * 1.15 = 46. Remaining: 200 - 46 = 154
    const walletRes = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(walletRes.body.creditBalance).toBe(154);
  });

  it('unlock with insufficient credits returns 402', async () => {
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'VVIP video',
        mediaUrl: 'https://ex.com/vvip.mp4',
        mediaType: 'image',
        creditCost: 150, // client cost is 173, user has 154 remaining
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
    // Member balance before: 154 credits. Selected gift costs 15 credits.
    const res = await request(app)
      .post(`/api/v1/adult/sext/conversations/${conversationId}/send-gift`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        giftId: testGiftId,
        message: 'A nice rose for you!'
      })
      .expect(200);

    expect(res.body.message).toBeDefined();
    expect(res.body.senderNewBalance).toBe(139); // 154 - 15
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
});

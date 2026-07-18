import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import jwt from 'jsonwebtoken';

describe('Private Messaging (Sext) Integration Tests', () => {
  let mongoServer: MongoMemoryReplSet;
  let memberToken: string;
  let providerToken: string;
  let strangerToken: string;
  let memberId: string;
  let providerId: string;
  let conversationId: string;

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
      credits: 100, // 100 credits initial
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
      providerProfile: {
        stageName: 'Lucia Star',
        categories: ['live_cam'],
        isLive: true,
        pricePerMinute: 0,
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
    // Member sends message. Receiver (provider) should have 1 unread.
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
    // Provider sends locked media to Member
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

    // Member gets messages
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
    // Send message again to get a fresh message
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

    // Unlock it
    const unlockRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${messageId}/unlock`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(unlockRes.body.success).toBe(true);
    expect(unlockRes.body.mediaUrl).toBe('https://ex.com/pic.png');

    // Check member's remaining balance. Base cost 40 * 1.15 = 46 (rounded up)
    // 100 - 46 = 54
    const walletRes = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(walletRes.body.creditBalance).toBe(54);
  });

  it('unlock with insufficient credits returns 402', async () => {
    // Try to unlock something expensive
    const msgRes = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'VVIP video',
        mediaUrl: 'https://ex.com/vvip.mp4',
        mediaType: 'image',
        creditCost: 100, // Client cost is 115 credits, user has 54 credits remaining
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/adult/sext/messages/${msgRes.body.id}/unlock`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(402);
  });
});

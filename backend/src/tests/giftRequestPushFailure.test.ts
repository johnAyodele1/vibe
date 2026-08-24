import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultGift from '../models/AdultGift';
import AdultConversation from '../models/AdultConversation';
import AdultMessage from '../models/AdultMessage';
import PushSubscription from '../models/PushSubscription';

jest.mock('web-push');

describe('Provider Gift Request Push Failure Regression Test', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let providerId: string;
  let memberId: string;
  let conversationId: string;
  let giftId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const adultJwtSecret = process.env.ADULT_JWT_SECRET || 'adult_secret';

    // 1. Create Provider and Member users
    const provider = await AdultUser.create({
      username: 'test_provider_push',
      displayName: 'Goddess Alice',
      email: 'provider_push@test.com',
      passwordHash: 'hash',
      role: 'provider',
      credits: 500,
      country: 'US',
      dateOfBirth: new Date('1995-01-01'),
      providerProfile: {
        stageName: 'Goddess Alice',
        isOnline: true,
      },
    });
    providerId = provider._id.toString();

    providerToken = jwt.sign(
      { sub: providerId, role: 'provider' },
      adultJwtSecret,
      { expiresIn: '1h' }
    );

    const member = await AdultUser.create({
      username: 'test_member_push',
      displayName: 'Bob Member',
      email: 'member_push@test.com',
      passwordHash: 'hash',
      role: 'user',
      credits: 1000,
      country: 'US',
      dateOfBirth: new Date('1992-01-01'),
    });
    memberId = member._id.toString();

    // 2. Create Active Gift
    const gift = await AdultGift.create({
      name: 'Luxury Rose Box',
      iconUrl: 'rose_box',
      creditCost: 150,
      category: 'romantic',
      isActive: true,
    });
    giftId = gift._id.toString();

    // 3. Create Conversation
    conversationId = [providerId, memberId].sort().join('_');
    await AdultConversation.create({
      _id: conversationId,
      participants: [provider._id, member._id],
      participantProfiles: [
        { userId: provider._id, displayName: 'Goddess Alice', avatarUrl: '/alice.jpg', accountType: 'provider', isOnline: true },
        { userId: member._id, displayName: 'Bob Member', avatarUrl: '/bob.jpg', accountType: 'member', isOnline: true },
      ],
      unreadCounts: new Map([
        [providerId, 0],
        [memberId, 0],
      ]),
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('provider sends gift request successfully even when push processing encounters stale subscription/legacy index condition', async () => {
    const db = mongoose.connection.db;
    const collection = db.collection('pushsubscriptions');

    // 4. Simulate production legacy index drift: create non-sparse unique index endpoint_1
    try {
      await collection.dropIndex('endpoint_1');
    } catch {
      // ignore if non-existent
    }
    await collection.createIndex({ endpoint: 1 }, { unique: true });

    // 5. Insert an existing subscription record with endpoint: null (occupying the single allowed null under unique non-sparse index)
    await collection.insertOne({
      userId: new mongoose.Types.ObjectId(),
      deviceId: 'legacy-device-already-null',
      endpoint: null,
      isActive: false,
    });

    // 6. Insert recipient (member) subscription with a stale endpoint that will trigger webpush 410 rejection
    await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(memberId),
      deviceId: 'member-stale-device',
      endpoint: 'https://updates.push.com/stale-token-410',
      keys: { p256dh: 'p256dh_key', auth: 'auth_key' },
      isActive: true,
      notificationsEnabled: true,
    });

    // Mock webpush.sendNotification to reject with HTTP 410 (Expired Token)
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce({
      statusCode: 410,
      message: 'Subscription expired or invalid',
    });

    // 7. Provider triggers sending a gift request via HTTP API
    const res = await request(app)
      .post(`/api/v1/adult/sext/conversations/${conversationId}/gift-request`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        giftId,
        message: 'Please send me this luxury rose box!',
      });

    // 8. CRITICAL ASSERTIONS:
    // a) Gift request API MUST succeed with HTTP 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.mediaType).toBe('gift_request');
    expect(res.body.giftRequest).toMatchObject({
      giftName: 'Luxury Rose Box',
      giftValue: 150,
      status: 'pending',
    });

    // b) Message record MUST be saved in database
    const savedMsg = await AdultMessage.findById(res.body.id);
    expect(savedMsg).not.toBeNull();
    expect(savedMsg?.giftRequest?.giftName).toBe('Luxury Rose Box');

    // c) Conversation lastMessage MUST be updated
    const updatedConv = await AdultConversation.findById(conversationId);
    expect(updatedConv?.lastMessage?.mediaType).toBe('gift_request');

    // d) Push notification error / DB cleanup error did NOT crash the request or leak E11000 to user
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
});

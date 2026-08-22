import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultCall from '../models/AdultCall';

describe('Call pricing server-authoritative lifecycle', () => {
  let mongoServer: MongoMemoryReplSet;
  let memberToken: string;
  let providerToken: string;
  let memberId: string;
  let providerId: string;
  let conversationId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    await mongoose.connect(mongoServer.getUri());

    const member = await AdultUser.create({
      email: 'call-pricing-member@example.com',
      passwordHash: 'password123',
      username: 'call_pricing_member',
      displayName: 'Call Pricing Member',
      dateOfBirth: new Date('1998-01-01'),
      role: 'user',
      country: 'Nigeria',
      credits: 100,
    });
    memberId = member._id.toString();

    const provider = await AdultUser.create({
      email: 'call-pricing-provider@example.com',
      passwordHash: 'password123',
      username: 'call_pricing_provider',
      displayName: 'Call Pricing Provider',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
      credits: 0,
      providerProfile: {
        stageName: 'Canonical Provider',
        pricePerMinute: 42,
        audioCallPrice: 2,
        videoCallPrice: 99,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        categories: [],
        contentTags: [],
        rating: { average: 5, count: 1 },
      },
    });
    providerId = provider._id.toString();

    memberToken = jwt.sign(
      { sub: memberId },
      process.env.ADULT_JWT_SECRET || 'adult_secret'
    );
    providerToken = jwt.sign(
      { sub: providerId },
      process.env.ADULT_JWT_SECRET || 'adult_secret'
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AdultCall.deleteMany({});
    const conversation = await mongoose.connection.collection<{ _id: string }>('adultconversations').findOne({
      participants: { $all: [new mongoose.Types.ObjectId(memberId), new mongoose.Types.ObjectId(providerId)] },
    });

    if (conversation) {
      conversationId = conversation._id;
      return;
    }

    conversationId = [memberId, providerId].sort().join('_');
    await mongoose.connection.collection<{ _id: string }>('adultconversations').insertOne({
      _id: conversationId,
      participants: [new mongoose.Types.ObjectId(memberId), new mongoose.Types.ObjectId(providerId)],
      participantProfiles: [
        {
          userId: new mongoose.Types.ObjectId(memberId),
          displayName: 'Call Pricing Member',
          avatarUrl: '/placeholder.svg',
          accountType: 'member',
          isOnline: true,
        },
        {
          userId: new mongoose.Types.ObjectId(providerId),
          displayName: 'Canonical Provider',
          avatarUrl: '/placeholder.svg',
          accountType: 'provider',
          isOnline: true,
        },
      ],
      unreadCounts: {
        [memberId]: 0,
        [providerId]: 0,
      },
      deletedBy: [],
      mutedBy: [],
      blockedBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('uses pricePerMinute for the initiated call even when legacy media prices differ', async () => {
    const res = await request(app)
      .post('/api/v1/adult/sext/calls/initiate')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ conversationId, type: 'video' })
      .expect(200);

    expect(res.body.perMinuteRate).toBe(42);

    const call = await AdultCall.findById(res.body.callId);
    expect(call?.perMinuteRate).toBe(42);
  });

  it('bills the canonical AdultCall.perMinuteRate and persists creditsDeducted', async () => {
    const initiateRes = await request(app)
      .post('/api/v1/adult/sext/calls/initiate')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ conversationId, type: 'audio' })
      .expect(200);

    const callId = initiateRes.body.callId as string;

    const acceptRes = await request(app)
      .put(`/api/v1/adult/sext/calls/${callId}/accept`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(acceptRes.body.perMinuteRate).toBe(42);

    const acceptedCall = await AdultCall.findById(callId);
    expect(acceptedCall?.status).toBe('active');
    expect(acceptedCall?.perMinuteRate).toBe(42);
    expect(acceptedCall?.creditsDeducted).toBe(42);

    const memberAfterAccept = await AdultUser.findById(memberId);
    expect(memberAfterAccept?.credits).toBe(58);

    await AdultCall.updateOne(
      { _id: callId },
      { $set: { startedAt: new Date(Date.now() - 11_000) } }
    );

    const endRes = await request(app)
      .put(`/api/v1/adult/sext/calls/${callId}/end`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'hung_up' })
      .expect(200);

    expect(endRes.body.creditsDeducted).toBe(42);

    const finalizedCall = await AdultCall.findById(callId);
    expect(finalizedCall?.status).toBe('ended');
    expect(finalizedCall?.perMinuteRate).toBe(42);
    expect(finalizedCall?.creditsDeducted).toBe(42);
  });
});

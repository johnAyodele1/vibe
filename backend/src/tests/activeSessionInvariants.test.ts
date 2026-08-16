import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultCall from '../models/AdultCall';
import CamSession from '../models/CamSession';
import AdultConversation from '../models/AdultConversation';
import jwt from 'jsonwebtoken';

describe('Single-Active-Session Invariant Integration Tests', () => {
  let mongoServer: MongoMemoryReplSet;

  let member1Token: string;
  let member1Id: string;

  let member2Token: string;
  let member2Id: string;

  let provider1Token: string;
  let provider1Id: string;

  let provider2Token: string;
  let provider2Id: string;

  let conv1Id: string;
  let conv2Id: string;
  let conv3Id: string;

  const ADULT_JWT_SECRET = process.env.ADULT_JWT_SECRET || 'adult_secret';

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Member 1
    const m1 = new AdultUser({
      email: 'member1@inv.com',
      passwordHash: 'pass',
      username: 'member1_inv',
      displayName: 'Member One',
      dateOfBirth: new Date('1998-01-01'),
      role: 'user',
      country: 'Nigeria',
      credits: 500,
    });
    await m1.save();
    member1Id = m1._id.toString();
    member1Token = jwt.sign({ sub: member1Id }, ADULT_JWT_SECRET);

    // Create Member 2
    const m2 = new AdultUser({
      email: 'member2@inv.com',
      passwordHash: 'pass',
      username: 'member2_inv',
      displayName: 'Member Two',
      dateOfBirth: new Date('1998-01-01'),
      role: 'user',
      country: 'Nigeria',
      credits: 500,
    });
    await m2.save();
    member2Id = m2._id.toString();
    member2Token = jwt.sign({ sub: member2Id }, ADULT_JWT_SECRET);

    // Create Provider 1
    const p1 = new AdultUser({
      email: 'provider1@inv.com',
      passwordHash: 'pass',
      username: 'provider1_inv',
      displayName: 'Provider One',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      status: 'active',
      isVerified: true,
      country: 'Nigeria',
      credits: 500,
      providerProfile: {
        stageName: 'Provider One',
        videoCallPrice: 10,
        audioCallPrice: 5,
        pricePerMinute: 10,
        onboarding: { isComplete: true, step: 4 },
      },
    });
    await p1.save();
    provider1Id = p1._id.toString();
    provider1Token = jwt.sign({ sub: provider1Id }, ADULT_JWT_SECRET);

    // Create Provider 2
    const p2 = new AdultUser({
      email: 'provider2@inv.com',
      passwordHash: 'pass',
      username: 'provider2_inv',
      displayName: 'Provider Two',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      status: 'active',
      isVerified: true,
      country: 'Nigeria',
      credits: 0,
      providerProfile: {
        stageName: 'Provider Two',
        videoCallPrice: 10,
        audioCallPrice: 5,
        pricePerMinute: 10,
        onboarding: { isComplete: true, step: 4 },
      },
    });
    await p2.save();
    provider2Id = p2._id.toString();
    provider2Token = jwt.sign({ sub: provider2Id }, ADULT_JWT_SECRET);

    // Create conversations with required custom _id string
    conv1Id = [member1Id, provider1Id].sort().join('_');
    const c1 = new AdultConversation({
      _id: conv1Id,
      participants: [m1._id, p1._id],
      unreadCounts: new Map(),
    });
    await c1.save();

    conv2Id = [member1Id, provider2Id].sort().join('_');
    const c2 = new AdultConversation({
      _id: conv2Id,
      participants: [m1._id, p2._id],
      unreadCounts: new Map(),
    });
    await c2.save();

    conv3Id = [member2Id, provider1Id].sort().join('_');
    const c3 = new AdultConversation({
      _id: conv3Id,
      participants: [m2._id, p1._id],
      unreadCounts: new Map(),
    });
    await c3.save();
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AdultCall.deleteMany({});
    await CamSession.deleteMany({});
  });

  describe('1. Active Call Invariant Tests (A - I)', () => {
    it('A. User with no active call → call succeeds', async () => {
      const res = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      expect(res.status).toBe(200);
      expect(res.body.callId).toBeDefined();
      expect(res.body.status).toBe('ringing');
    });

    it('B. User already caller in active call → new call rejected', async () => {
      // User 1 initiates Call 1 with Provider 1
      const call1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      expect(call1.status).toBe(200);

      // User 1 tries initiating Call 2 with Provider 2 on another device
      const call2 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv2Id, type: 'video' });

      expect(call2.status).toBe(409);
      expect(call2.body.error).toMatch(/already on a call/i);
    });

    it('C. User already receiver in active call → new call rejected', async () => {
      // Member 1 calls Provider 1 (Provider 1 is receiver in active ringing call)
      const call1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      expect(call1.status).toBe(200);

      // Provider 1 tries to call Member 2 on another device
      const call2 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ conversationId: conv3Id, type: 'video' });

      expect(call2.status).toBe(409);
      expect(call2.body.error).toMatch(/already on a call/i);
    });

    it('D. Same user on another device → rejected', async () => {
      // Member 1 initiates a call
      await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      // Member 1 on device B attempts another call
      const res = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv2Id, type: 'audio' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("You are already on a call on another device.");
    });

    it('E. Both concurrent call requests → exactly one succeeds', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv2Id, type: 'video' }),
      ]);

      const successCount = [res1, res2].filter(r => r.status === 200).length;
      const rejectedCount = [res1, res2].filter(r => r.status === 409).length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(1);
    });

    it('F. End existing call → user can start another call', async () => {
      // 1. Initiate call
      const initRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      const callId = initRes.body.callId;

      // 2. Accept call
      await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/accept`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      // 3. End call
      const endRes = await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/end`)
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ reason: 'finished' });
      expect(endRes.status).toBe(200);

      // 4. Start new call
      const newCallRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv2Id, type: 'video' });

      expect(newCallRes.status).toBe(200);
    });

    it('G. Failed/cancelled call → user can start another call', async () => {
      // 1. Initiate call
      const initRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      const callId = initRes.body.callId;

      // 2. Decline call
      await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/decline`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      // 3. Start another call
      const newCallRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      expect(newCallRes.status).toBe(200);
    });

    it('H. Stale/ended historical calls do not block new calls', async () => {
      // Seed old ended call
      const oldCall = new AdultCall({
        conversationId: conv1Id,
        callerId: member1Id,
        receiverId: provider1Id,
        type: 'video',
        status: 'ended',
        isActiveSession: false,
        activeParticipants: [],
        perMinuteRate: 10,
        webrtcRoomId: 'room_old',
      });
      await oldCall.save();

      // Initiate new call
      const newCallRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      expect(newCallRes.status).toBe(200);
    });

    it('I. Both participants cannot create another call while active', async () => {
      const initRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      const callId = initRes.body.callId;

      await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/accept`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      // Caller (Member 1) tries another call
      const callerTry = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv2Id, type: 'video' });
      expect(callerTry.status).toBe(409);

      // Receiver (Provider 1) tries another call
      const receiverTry = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ conversationId: conv3Id, type: 'video' });
      expect(receiverTry.status).toBe(409);

      // Third party (Member 2) tries calling Provider 1
      const thirdPartyTry = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });
      expect(thirdPartyTry.status).toBe(409);
      expect(thirdPartyTry.body.error).toBe("The other user is currently in another call.");
    });
  });

  describe('2. Active Livestream Invariant Tests (J - O)', () => {
    it('J. No active stream → livestream succeeds', async () => {
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'My Stream' });

      expect(res.status).toBe(201);
      expect(res.body.data.sessionId).toBeDefined();
    });

    it('K. Existing live stream → second device rejected', async () => {
      // Device A starts stream
      await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Device A Stream' });

      // Device B attempts start stream
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Device B Stream' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("You are already streaming on another device.");
    });

    it('L. Concurrent start-stream requests → exactly one succeeds', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/adult/cams/stream/start')
          .set('Authorization', `Bearer ${provider1Token}`)
          .send({ title: 'Concurrent Stream 1' }),
        request(app)
          .post('/api/adult/cams/stream/start')
          .set('Authorization', `Bearer ${provider1Token}`)
          .send({ title: 'Concurrent Stream 2' }),
      ]);

      const successCount = [res1, res2].filter(r => r.status === 201).length;
      const rejectedCount = [res1, res2].filter(r => r.status === 409).length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(1);
    });

    it('M. End existing stream → streamer can go live again', async () => {
      // 1. Start stream
      const startRes = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'First Stream' });
      const sessionId = startRes.body.data.sessionId;

      // 2. End stream
      await request(app)
        .patch(`/api/adult/cams/stream/${sessionId}/end`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      // 3. Start stream again
      const newStreamRes = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Second Stream' });

      expect(newStreamRes.status).toBe(201);
    });

    it('N. Failed/cancelled stream → streamer can retry', async () => {
      // Create interrupted stream
      const interruptedSession = new CamSession({
        providerId: provider1Id,
        title: 'Interrupted',
        streamKey: `cam_${provider1Id}_test`,
        streamPlaybackUrl: `cam_${provider1Id}_test`,
        status: 'interrupted',
        startedAt: new Date(),
        endedAt: new Date(),
      });
      await interruptedSession.save();

      // Start stream again
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Retry Stream' });

      expect(res.status).toBe(201);
    });

    it('O. Historical ended streams do not block new streams', async () => {
      // Create historical ended streams
      await CamSession.create([
        {
          providerId: provider1Id,
          title: 'Past Stream 1',
          streamKey: `cam_${provider1Id}_past1`,
          streamPlaybackUrl: `cam_${provider1Id}_past1`,
          status: 'ended',
          startedAt: new Date(Date.now() - 3600000),
          endedAt: new Date(Date.now() - 1800000),
        },
        {
          providerId: provider1Id,
          title: 'Past Stream 2',
          streamKey: `cam_${provider1Id}_past2`,
          streamPlaybackUrl: `cam_${provider1Id}_past2`,
          status: 'ended',
          startedAt: new Date(Date.now() - 7200000),
          endedAt: new Date(Date.now() - 5400000),
        },
      ]);

      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'New Active Stream' });

      expect(res.status).toBe(201);
    });
  });
});

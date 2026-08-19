import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultCall from '../models/AdultCall';
import CamSession from '../models/CamSession';
import AdultConversation from '../models/AdultConversation';
import jwt from 'jsonwebtoken';

describe('Single-Active-Session Invariant Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

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

  const verifyDatabaseInvariants = async () => {
    // 1. Verify no participant is in more than one active/ringing session
    const activeCalls = await AdultCall.find({ isActiveSession: true });
    const participantCounts = new Map<string, number>();

    for (const call of activeCalls) {
      expect(['ringing', 'active']).toContain(call.status);
      expect(call.activeParticipants.length).toBeGreaterThan(0);
      for (const p of call.activeParticipants) {
        const pId = p.toString();
        participantCounts.set(pId, (participantCounts.get(pId) || 0) + 1);
      }
    }

    for (const [pId, count] of participantCounts.entries()) {
      expect(count).toBeLessThanOrEqual(1);
    }

    // 2. Verify no non-active/ended calls have isActiveSession = true or non-empty activeParticipants
    const inactiveCalls = await AdultCall.find({ isActiveSession: false });
    for (const call of inactiveCalls) {
      expect(call.activeParticipants).toHaveLength(0);
      expect(['ended', 'declined', 'missed', 'failed']).toContain(call.status);
    }

    // 3. Verify no provider has more than one live or pending stream
    const liveStreams = await CamSession.find({ status: 'live' });
    const liveProviderCounts = new Map<string, number>();
    for (const stream of liveStreams) {
      const pId = stream.providerId.toString();
      liveProviderCounts.set(pId, (liveProviderCounts.get(pId) || 0) + 1);
    }
    for (const [pId, count] of liveProviderCounts.entries()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '6.0.14' }
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
      credits: 500,
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

    // Ensure database indexes are created
    await AdultCall.ensureIndexes();
    await CamSession.ensureIndexes();

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
      await verifyDatabaseInvariants();
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
      expect(call2.body.error).toBe('You are already on a call on another device.');
      await verifyDatabaseInvariants();
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
      expect(call2.body.error).toBe('You are already on a call on another device.');
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
    });

    it('E2. Device A HTTP initiateCall and Device B HTTP initiateCall simultaneously → exactly one succeeds, one gets 409', async () => {
      const [devA, devB] = await Promise.all([
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv2Id, type: 'audio' }),
      ]);

      const successes = [devA, devB].filter(r => r.status === 200);
      const rejections = [devA, devB].filter(r => r.status === 409);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(1);
      expect(rejections[0].body.error).toBe("You are already on a call on another device.");
      await verifyDatabaseInvariants();
    });

    it('E3. Backend server restart does NOT end active calls in DB', async () => {
      // 1. Create active call
      const initRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      expect(initRes.status).toBe(200);
      const activeCallId = initRes.body.callId;

      // 2. Simulate server restart cleanStalePresence()
      const { cleanStalePresence } = require('../socket/adultSocket');
      await cleanStalePresence();

      // 3. Verify call in DB remains active/ringing
      const callAfterRestart = await AdultCall.findById(activeCallId);
      expect(callAfterRestart).not.toBeNull();
      expect(callAfterRestart?.status).toBe('ringing');
      expect(callAfterRestart?.isActiveSession).toBe(true);
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      expect(callerTry.body.error).toBe("You are already on a call on another device.");

      // Receiver (Provider 1) tries another call
      const receiverTry = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ conversationId: conv3Id, type: 'video' });
      expect(receiverTry.status).toBe(409);
      expect(receiverTry.body.error).toBe("You are already on a call on another device.");

      // Third party (Member 2) tries calling Provider 1
      const thirdPartyTry = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });
      expect(thirdPartyTry.status).toBe(409);
      expect(thirdPartyTry.body.error).toBe("This provider is busy. Try again later.");
      await verifyDatabaseInvariants();
    });
  });

  describe('3. Extended Single Session & Concurrency Matrix Tests (1 - 13)', () => {
    it('1. Same member / same provider / simultaneous calls → exactly 1 reservation succeeds', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
      ]);

      const success = [res1, res2].filter(r => r.status === 200);
      const rejected = [res1, res2].filter(r => r.status === 409);

      expect(success.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].body.error).toBe("You are already on a call on another device.");
      await verifyDatabaseInvariants();
    });

    it('2. Same member / different providers / simultaneous calls → exactly 1 succeeds', async () => {
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

      const success = [res1, res2].filter(r => r.status === 200);
      const rejected = [res1, res2].filter(r => r.status === 409);

      expect(success.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].body.error).toBe("You are already on a call on another device.");
      await verifyDatabaseInvariants();
    });

    it('3. Same member / same device / rapid duplicate call → 1 ringing call, 1 rejected request', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
      ]);

      expect([res1.status, res2.status].sort()).toEqual([200, 409]);
      const ringingCalls = await AdultCall.find({ callerId: member1Id, status: 'ringing', isActiveSession: true });
      expect(ringingCalls).toHaveLength(1);
      await verifyDatabaseInvariants();
    });

    it('4. Different members / same provider / simultaneous calls → 1 succeeds, 1 rejected with provider busy message', async () => {
      const [m1Call, m2Call] = await Promise.all([
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member1Token}`)
          .send({ conversationId: conv1Id, type: 'video' }),
        request(app)
          .post('/api/v1/adult/sext/calls/initiate')
          .set('Authorization', `Bearer ${member2Token}`)
          .send({ conversationId: conv3Id, type: 'video' }),
      ]);

      const successes = [m1Call, m2Call].filter(r => r.status === 200);
      const rejections = [m1Call, m2Call].filter(r => r.status === 409);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(1);
      expect(rejections[0].body.error).toBe("This provider is busy. Try again later.");
      await verifyDatabaseInvariants();
    });

    it('5. Provider busy while first call is ringing → competing request gets 409 provider busy', async () => {
      // Call 1 created and ringing
      const call1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      expect(call1.status).toBe(200);

      // Call 2 attempted while Call 1 is ringing
      const call2 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });

      expect(call2.status).toBe(409);
      expect(call2.body.error).toBe("This provider is busy. Try again later.");
      await verifyDatabaseInvariants();
    });

    it('6. Provider busy while first call is active → competing request gets 409 provider busy', async () => {
      // Call 1 created & accepted
      const call1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      await request(app)
        .put(`/api/v1/adult/sext/calls/${call1.body.callId}/accept`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      // Call 2 attempted while Call 1 is active
      const call2 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });

      expect(call2.status).toBe(409);
      expect(call2.body.error).toBe("This provider is busy. Try again later.");
      await verifyDatabaseInvariants();
    });

    it('7. Simultaneous provider acceptance → exactly one becomes active', async () => {
      // Create Call 1
      const call1 = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      const call1Id = call1.body.callId;

      // Two simultaneous accepts on Call 1
      const [accept1, accept2] = await Promise.all([
        request(app)
          .put(`/api/v1/adult/sext/calls/${call1Id}/accept`)
          .set('Authorization', `Bearer ${provider1Token}`)
          .send(),
        request(app)
          .put(`/api/v1/adult/sext/calls/${call1Id}/accept`)
          .set('Authorization', `Bearer ${provider1Token}`)
          .send(),
      ]);

      const activeCall = await AdultCall.findById(call1Id);
      expect(activeCall?.status).toBe('active');

      const statuses = [accept1.status, accept2.status].sort();
      expect(statuses[0]).toBe(200); // 1 succeeded
      expect([200, 409]).toContain(statuses[1]); // 2nd got 200 (idempotent minute 1) or 409
      await verifyDatabaseInvariants();
    });

    it('8. Provider starts two streams simultaneously → exactly 1 live stream, 1 gets 409', async () => {
      const [s1, s2] = await Promise.all([
        request(app)
          .post('/api/adult/cams/stream/start')
          .set('Authorization', `Bearer ${provider1Token}`)
          .send({ title: 'Stream 1' }),
        request(app)
          .post('/api/adult/cams/stream/start')
          .set('Authorization', `Bearer ${provider1Token}`)
          .send({ title: 'Stream 2' }),
      ]);

      const successes = [s1, s2].filter(r => r.status === 201);
      const rejections = [s1, s2].filter(r => r.status === 409);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(1);
      expect(rejections[0].body.error).toBe("You are already streaming on another device.");
      await verifyDatabaseInvariants();
    });

    it('9. Decline releases provider reservation', async () => {
      const call = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      await request(app)
        .put(`/api/v1/adult/sext/calls/${call.body.callId}/decline`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      const callInDb = await AdultCall.findById(call.body.callId);
      expect(callInDb?.isActiveSession).toBe(false);
      expect(callInDb?.activeParticipants).toHaveLength(0);

      // New call now succeeds
      const newCall = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });
      expect(newCall.status).toBe(200);
      await verifyDatabaseInvariants();
    });

    it('10. Timeout releases provider reservation', async () => {
      const call = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      await AdultCall.findByIdAndUpdate(call.body.callId, {
        status: 'missed',
        endReason: 'timeout',
        isActiveSession: false,
        activeParticipants: [],
      });

      const newCall = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });

      expect(newCall.status).toBe(200);
      await verifyDatabaseInvariants();
    });

    it('11. Missed call releases provider reservation', async () => {
      const call = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      const missedRes = await request(app)
        .put(`/api/v1/adult/sext/calls/${call.body.callId}/missed`)
        .set('Authorization', `Bearer ${member1Token}`)
        .send();
      expect(missedRes.status).toBe(200);

      const newCall = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member2Token}`)
        .send({ conversationId: conv3Id, type: 'video' });

      expect(newCall.status).toBe(200);
      await verifyDatabaseInvariants();
    });

    it('12. Failed call releases provider reservation', async () => {
      const call = await AdultCall.create({
        conversationId: conv1Id,
        callerId: member1Id,
        receiverId: provider1Id,
        activeParticipants: [],
        isActiveSession: false,
        type: 'video',
        status: 'failed',
        endReason: 'connection_error',
        perMinuteRate: 10,
        webrtcRoomId: 'room_failed',
      });

      const newCall = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      expect(newCall.status).toBe(200);
      await verifyDatabaseInvariants();
    });

    it('13. Ended call releases both participants', async () => {
      const call = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      await request(app)
        .put(`/api/v1/adult/sext/calls/${call.body.callId}/accept`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      await request(app)
        .put(`/api/v1/adult/sext/calls/${call.body.callId}/end`)
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ reason: 'hung_up' });

      const endedCallInDb = await AdultCall.findById(call.body.callId);
      expect(endedCallInDb?.isActiveSession).toBe(false);
      expect(endedCallInDb?.activeParticipants).toHaveLength(0);

      // Caller can call someone else
      const callerNewCall = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv2Id, type: 'video' });
      expect(callerNewCall.status).toBe(200);

      await verifyDatabaseInvariants();
    });
  });

  describe('4. Active Livestream Invariant Tests (J - O)', () => {
    it('J. No active stream → livestream succeeds', async () => {
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'My Stream' });

      expect(res.status).toBe(201);
      expect(res.body.data.sessionId).toBeDefined();
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
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
      await verifyDatabaseInvariants();
    });
  });

  describe('5. Streaming + 1-to-1 Call Acceptance Lifecycle Tests', () => {
    it('Ringing private call preserves public livestream; Provider acceptance ends public livestream and starts private call', async () => {
      // 1. Provider 1 starts public livestream
      const startRes = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Public Stream' });
      expect(startRes.status).toBe(201);
      const streamId = startRes.body.data.sessionId;

      // Update stream status to live
      await CamSession.findByIdAndUpdate(streamId, { status: 'live' });

      // 2. Member 1 initiates 1-to-1 video call with Provider 1
      const callInitRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });

      expect(callInitRes.status).toBe(200);
      const callId = callInitRes.body.callId;

      // Verify public livestream remains LIVE while private call is RINGING
      const streamWhileRinging = await CamSession.findById(streamId);
      expect(streamWhileRinging?.status).toBe('live');

      // 3. Provider 1 accepts the private 1-to-1 call
      const acceptRes = await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/accept`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();

      expect(acceptRes.status).toBe(200);

      // 4. Verify public livestream was ENDED upon acceptance
      const streamAfterAccept = await CamSession.findById(streamId);
      expect(streamAfterAccept?.status).toBe('ended');

      // 5. Verify private 1-to-1 call became ACTIVE
      const activeCall = await AdultCall.findById(callId);
      expect(activeCall?.status).toBe('active');

      await verifyDatabaseInvariants();
    });

    it('Ringing private call declined or cancelled preserves public livestream', async () => {
      // 1. Provider 1 starts public stream
      const startRes = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${provider1Token}`)
        .send({ title: 'Public Stream' });
      const streamId = startRes.body.data.sessionId;
      await CamSession.findByIdAndUpdate(streamId, { status: 'live' });

      // 2. Member 1 initiates call
      const callInitRes = await request(app)
        .post('/api/v1/adult/sext/calls/initiate')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ conversationId: conv1Id, type: 'video' });
      const callId = callInitRes.body.callId;

      // 3. Provider 1 declines call
      const declineRes = await request(app)
        .put(`/api/v1/adult/sext/calls/${callId}/decline`)
        .set('Authorization', `Bearer ${provider1Token}`)
        .send();
      expect(declineRes.status).toBe(200);

      // 4. Public livestream MUST REMAIN LIVE
      const streamAfterDecline = await CamSession.findById(streamId);
      expect(streamAfterDecline?.status).toBe('live');
    });
  });
});

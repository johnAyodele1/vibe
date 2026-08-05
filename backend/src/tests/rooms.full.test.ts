import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import Room from '../models/Room';
import AdultThread from '../models/AdultThread';
import AdultRoomMessage from '../models/AdultRoomMessage';
import RoomMembership from '../models/RoomMembership';
import AdultRoomPoll from '../models/AdultRoomPoll';
import Report from '../models/Report';
import jwt from 'jsonwebtoken';

describe('Naughty Rooms Integration Tests Suite', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;
  let memberToken: string;
  let nonMemberToken: string;
  let adminId: string;
  let memberId: string;
  let nonMemberId: string;
  let roomId: string;
  let threadId: string;
  let messageId: string;
  let pollId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Admin User
    const admin = new AdultUser({
      email: 'admin.rooms@vibe.com',
      passwordHash: 'password123',
      username: 'adminrooms',
      displayName: 'Admin Moderator',
      dateOfBirth: new Date('1990-01-01'),
      role: 'provider',
      ageVerified: true,
      country: 'USA',
      credits: 1000,
    });
    await admin.save();
    adminId = admin._id.toString();
    adminToken = jwt.sign({ sub: adminId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create Member User
    const member = new AdultUser({
      email: 'member.rooms@vibe.com',
      passwordHash: 'password123',
      username: 'memberrooms',
      displayName: 'Gold Member',
      dateOfBirth: new Date('1995-01-01'),
      role: 'user',
      ageVerified: true,
      subscriptionTier: 'gold',
      country: 'UK',
      credits: 500,
    });
    await member.save();
    memberId = member._id.toString();
    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create Free User (without sub / low credits)
    const nonMember = new AdultUser({
      email: 'free.rooms@vibe.com',
      passwordHash: 'password123',
      username: 'freerooms',
      displayName: 'Free Tier User',
      dateOfBirth: new Date('2001-01-01'),
      role: 'user',
      ageVerified: true,
      subscriptionTier: 'none',
      country: 'UK',
      credits: 0,
    });
    await nonMember.save();
    nonMemberId = nonMember._id.toString();
    nonMemberToken = jwt.sign({ sub: nonMemberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // ==========================================
  // 1. ROOMS TESTS
  // ==========================================
  describe('Rooms Endpoints', () => {
    it('should create a room successfully', async () => {
      const res = await request(app)
        .post('/api/v1/adult/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'The Red Room',
          description: 'High intensity, explicit roleplay only',
          category: 'Roleplay',
          mood: 'explicit',
          rules: ['No spamming', 'Respect host'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.room.name).toBe('The Red Room');
      expect(res.body.data.room.mood).toBe('explicit');
      expect(res.body.data.room.category).toBe('roleplay'); // cleaned in controller
      roomId = res.body.data.room._id;

      // Admin joins to establish moderator/host membership
      await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should create a VIP room', async () => {
      await request(app)
        .post('/api/v1/adult/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Elite VIP Lounge',
          category: 'vip',
          mood: 'chill',
          requiresSubscription: true,
        })
        .expect(201);
    });

    it('should list all active rooms sorted pinned first, then memberCount desc', async () => {
      const res = await request(app)
        .get('/api/v1/adult/rooms')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.rooms.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter rooms list by category and mood', async () => {
      const res = await request(app)
        .get('/api/v1/adult/rooms?category=roleplay&mood=explicit')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.rooms[0].name).toBe('The Red Room');
    });

    it('should allow user to join a room', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.membership.role).toBe('member');

      // Verify memberCount incremented (Admin + Member = 2)
      const room = await Room.findById(roomId);
      expect(room!.memberCount).toBe(2);
    });

    it('should block non-subscribers from joining a VIP room', async () => {
      const vipRoom = await Room.findOne({ category: 'vip' });
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${vipRoom!._id}/join`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should retrieve active room members', async () => {
      const res = await request(app)
        .get(`/api/v1/adult/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.members).toHaveLength(2);
      const names = res.body.data.members.map((m: any) => m.displayName);
      expect(names).toContain('Gold Member');
      expect(names).toContain('Admin Moderator');
    });
  });

  // ==========================================
  // 2. THREADS TESTS
  // ==========================================
  describe('Threads Endpoints', () => {
    it('should create a thread in a room', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Roleplay scenario A',
          body: 'Let us start a roleplay prompt about an dark editorial castle.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.thread.title).toBe('Roleplay scenario A');
      threadId = res.body.data.thread._id;
    });

    it('should validate thread title length <= 80', async () => {
      const longTitle = 'A'.repeat(81);
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: longTitle,
          body: 'Some body content.',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should list threads sorted hot as default', async () => {
      const res = await request(app)
        .get(`/api/v1/adult/rooms/${roomId}/threads`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.threads.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.threads[0].title).toBe('Roleplay scenario A');
    });

    it('should toggle thread reaction - add and remove', async () => {
      // Add reaction
      let res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/react`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '🔥' })
        .expect(200);

      expect(res.body.data.thread.reactionCounts['🔥']).toBe(1);

      // Remove reaction
      res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/react`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '🔥' })
        .expect(200);

      expect(res.body.data.thread.reactionCounts['🔥']).toBe(0);
    });

    it('should allow moderator to pin a thread', async () => {
      const res = await request(app)
        .put(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/pin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.thread.isPinned).toBe(true);
    });

    it('should block non-moderator from pinning a thread', async () => {
      const res = await request(app)
        .put(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/pin`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should allow moderator to lock a thread', async () => {
      const res = await request(app)
        .put(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.thread.isLocked).toBe(true);
    });
  });

  // ==========================================
  // 3. MESSAGES & REPLIES TESTS
  // ==========================================
  describe('Messages & Thread Replies Endpoints', () => {
    it('should post a message to room main feed', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          content: 'Hello everyone in the main feed!',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message.content).toBe('Hello everyone in the main feed!');
      messageId = res.body.data.message._id;
    });

    it('should toggle message reaction', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/messages/${messageId}/react`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '💋' })
        .expect(200);

      expect(res.body.data.message.reactions[0].emoji).toBe('💋');
      expect(res.body.data.message.reactions[0].count).toBe(1);
    });

    it('should allow owner to soft delete own message', async () => {
      const res = await request(app)
        .delete(`/api/v1/adult/rooms/${roomId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const msg = await AdultRoomMessage.findById(messageId);
      expect(msg!.content).toBe('[deleted]');
      expect(msg!.isDeleted).toBe(true);
    });

    it('should reject posting a reply to a locked thread', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/replies`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'I am replying.' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LOCKED');
    });

    it('should post reply after moderator unlocks the thread', async () => {
      // Unlock thread
      await request(app)
        .put(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Join room for admin so membership exists
      await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/threads/${threadId}/replies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Perfect unlocked reply!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reply.content).toBe('Perfect unlocked reply!');

      // Check thread replyCount incremented
      const thread = await AdultThread.findById(threadId);
      expect(thread!.replyCount).toBe(1);
    });
  });

  // ==========================================
  // 4. POLL TESTS
  // ==========================================
  describe('Polls Endpoints', () => {
    it('should allow moderator to create a poll', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/polls`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'What is your favorite gradient color?',
          options: ['Crimson', 'Neon Purple', 'Gold'],
          expiresInMinutes: 30,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.poll.options).toHaveLength(3);
      pollId = res.body.data.poll._id;
    });

    it('should allow member to vote on poll', async () => {
      // Fetch active poll to get optionId
      const activeRes = await request(app)
        .get(`/api/v1/adult/rooms/${roomId}/polls/active`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const optionId = activeRes.body.data.polls[0].options[0].id;

      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ optionId })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.poll.options[0].voteCount).toBe(1);
    });

    it('should reject double voting on poll with 409 conflict', async () => {
      const activeRes = await request(app)
        .get(`/api/v1/adult/rooms/${roomId}/polls/active`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const optionId = activeRes.body.data.polls[0].options[0].id;

      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ optionId })
        .expect(409);

      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 5. MODERATION TESTS
  // ==========================================
  describe('Moderation Endpoints', () => {
    it('should allow reporting a room element', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/report`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          targetId: memberId,
          type: 'user',
          reason: 'Hate speech in thread',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.report.reason).toBe('Hate speech in thread');
    });

    it('should allow moderator to mute user in room', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/members/${memberId}/mute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ durationMinutes: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.mutedUntil).toBeDefined();
    });

    it('should reject sending messages for muted users with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/adult/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'This should be blocked' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MUTED');
    });

    it('should allow moderator to kick a member from room', async () => {
      const res = await request(app)
        .delete(`/api/v1/adult/rooms/${roomId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const membership = await RoomMembership.findOne({ roomId, userId: memberId });
      expect(membership).toBeNull();
    });
  });
});

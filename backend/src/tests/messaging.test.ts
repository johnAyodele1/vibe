import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import { generateAccessToken } from '../middleware/auth';

describe('Messaging & Matches Endpoints', () => {
  let token: string;
  let userId: string;
  let otherUserId: string;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});

    const user = await User.create({
      email: 'user@example.com',
      password: 'password123',
      firstName: 'User',
      dateOfBirth: '1995-01-01',
      gender: 'Male'
    });
    userId = (user._id as Types.ObjectId).toString();
    token = generateAccessToken(userId);

    const otherUser = await User.create({
      email: 'other@example.com',
      firstName: 'Other',
      dateOfBirth: '1995-01-01',
      gender: 'Female',
      googleId: 'google123'
    });
    otherUserId = (otherUser._id as Types.ObjectId).toString();
  });

  describe('Matches Endpoints', () => {
    it('GET /api/matches - should get user matches', async () => {
        await User.findByIdAndUpdate(userId, {
            $push: { matches: { user: otherUserId, matchedAt: new Date(), isActive: true } }
        });

        const res = await request(app)
            .get('/api/matches')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.matches.length).toBe(1);
    });

    it('DELETE /api/matches/:id - should unmatch user', async () => {
        await User.findByIdAndUpdate(userId, {
            $push: { matches: { user: otherUserId, matchedAt: new Date(), isActive: true } }
        });

        const res = await request(app)
            .delete(`/api/matches/${otherUserId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        const user = await User.findById(userId);
        expect(user?.matches.length).toBe(0);
    });
  });

  describe('Messaging Endpoints', () => {
    let conversationId: string;

    beforeEach(async () => {
        const conversation = new Conversation({
            participants: [userId, otherUserId]
          });
          await conversation.save();
          conversationId = (conversation._id as Types.ObjectId).toString();
    });

    it('GET /api/messages/conversations - should get user conversations', async () => {
      const res = await request(app)
        .get('/api/messages/conversations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversations.length).toBe(1);
    });

    it('GET /api/messages/conversation/:id - should get specific conversation', async () => {
        const res = await request(app)
          .get(`/api/messages/conversation/${conversationId}`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.conversation._id).toBe(conversationId);
      });

    it('GET /api/messages/:id - should get messages for conversation', async () => {
        await Message.create({
            conversation: conversationId,
            sender: userId,
            receiver: otherUserId,
            content: 'Test message'
        });

        const res = await request(app)
          .get(`/api/messages/${conversationId}`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.messages.length).toBe(1);
        expect(res.body.data.messages[0].content).toBe('Test message');
    });

    it('POST /api/messages - should send a message', async () => {
      const res = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: otherUserId,
          content: 'Hello!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.content).toBe('Hello!');
    });
  });
});

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { generateAgoraToken } from '../services/agora.service';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import jwt from 'jsonwebtoken';

describe('Agora Token Generation', () => {
  it('generates a valid token string for a user and room', () => {
    const appId = '123456';
    const appCertificate = '12345678901234567890123456789012';
    const roomId = 'room1';
    const userId = 'userA';

    const token = generateAgoraToken(appId, appCertificate, roomId, userId, 'publisher', 3600);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });
});

describe('Agora Endpoints & Logic Integration', () => {
  let mongoServer: MongoMemoryServer;
  let adultUser: any;
  let providerUser: any;
  let token: string;
  let providerToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.disconnect(); // ensure we disconnect first if any connection existed
    await mongoose.connect(mongoUri);

    // Setup test users
    adultUser = new AdultUser({
      username: 'testuser',
      passwordHash: 'dummyhash',
      email: 'test@example.com',
      displayName: 'Test User',
      dateOfBirth: new Date(1990, 1, 1),
      role: 'user',
      country: 'US',
      emailVerified: true,
      status: 'active',
    });
    await adultUser.save();

    providerUser = new AdultUser({
      username: 'testprovider',
      passwordHash: 'dummyhash',
      email: 'provider@example.com',
      displayName: 'Test Provider',
      dateOfBirth: new Date(1990, 1, 1),
      role: 'provider',
      country: 'US',
      emailVerified: true,
      status: 'active',
      isVerified: true,
      providerProfile: {
        onboarding: {
          isComplete: true,
        },
      },
    });
    await providerUser.save();

    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    token = jwt.sign({ sub: adultUser._id.toString(), role: 'user' }, secret);
    providerToken = jwt.sign({ sub: providerUser._id.toString(), role: 'provider' }, secret);
  }, 15000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  }, 15000);

  describe('GET /api/v1/adult/zego/token', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .get('/api/v1/adult/zego/token?roomId=room1&type=call');
      expect(res.status).toBe(401);
    });

    it('returns 400 without roomId', async () => {
      const res = await request(app)
        .get('/api/v1/adult/zego/token?type=call')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('returns token details with valid params', async () => {
      const res = await request(app)
        .get('/api/v1/adult/zego/token?roomId=room1&type=call')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('appId');
      expect(res.body).toHaveProperty('roomId', 'room1');
    });
  });

  describe('Live Cam Streaming with Agora', () => {
    it('POST /api/adult/cams/stream/start returns roomId and token for provider', async () => {
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'My Hot Stream',
          tags: ['sexy'],
          sessionType: 'public',
          privateShowRate: 10,
          resolution: '720p',
          chatEnabled: true,
          recordingEnabled: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('roomId');
      expect(res.body.data).toHaveProperty('token');
    });
  });
});

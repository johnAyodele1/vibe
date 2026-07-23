import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { generateZegoToken } from '../services/zego.service';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import { RandomMatch } from '../models/RandomMatch';
import jwt from 'jsonwebtoken';

describe('ZegoCloud Token Generation', () => {
  const appId = 123456;
  const secret = '12345678901234567890123456789012';

  it('generates a valid token string for a user and room', () => {
    const token = generateZegoToken(appId, 'user123', secret, 3600, 'test-payload');
    expect(token).toBeDefined();
    expect(token.startsWith('04')).toBe(true);
  });

  it('different users get different tokens for the same room', () => {
    const tokenA = generateZegoToken(appId, 'userA', secret, 3600);
    const tokenB = generateZegoToken(appId, 'userB', secret, 3600);
    expect(tokenA).not.toBe(tokenB);
  });
});

describe('ZegoCloud Endpoints & Logic Integration', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;
  let memberId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create a provider
    const provider = new AdultUser({
      email: 'prov@vibe.com',
      passwordHash: 'hash',
      username: 'provider_test',
      displayName: 'Prov Test',
      dateOfBirth: new Date('1995-01-01'),
      country: 'USA',
      role: 'provider',
      ageVerified: true,
      isVerified: true,
      status: 'active',
      credits: 1000,
      providerProfile: {
        stageName: 'Prov Test',
        bio: 'Bio',
        videoCallPrice: 5,
        audioCallPrice: 2,
        onboarding: { isComplete: true }
      }
    });
    await provider.save();
    providerId = provider._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a member
    const member = new AdultUser({
      email: 'member@vibe.com',
      passwordHash: 'hash',
      username: 'member_test',
      displayName: 'Member Test',
      dateOfBirth: new Date('1996-01-01'),
      country: 'USA',
      role: 'user',
      ageVerified: true,
      credits: 500,
    });
    await member.save();
    memberId = member._id.toString();
    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('GET /api/v1/adult/zego/token', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .get('/api/v1/adult/zego/token?roomId=room1&type=call')
        .expect(401);
    });

    it('returns 400 without roomId', async () => {
      await request(app)
        .get('/api/v1/adult/zego/token?type=call')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(400);
    });

    it('returns token details with valid params', async () => {
      const res = await request(app)
        .get('/api/v1/adult/zego/token?roomId=room1&type=call')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.body.appId).toBeDefined();
      expect(res.body.userId).toBe(memberId);
      expect(res.body.roomId).toBe('room1');
    });
  });

  describe('Live Cam Streaming with ZegoCloud', () => {
    let sessionId: string;
    let roomId: string;

    it('POST /api/adult/cams/stream/start returns roomId and token for provider', async () => {
      const res = await request(app)
        .post('/api/adult/cams/stream/start')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          title: 'Host Cam',
          tags: ['test'],
          sessionType: 'public',
          privateShowRate: 50,
          resolution: '1080p',
          chatEnabled: true,
          recordingEnabled: false
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.roomId).toBeDefined();
      sessionId = res.body.data.sessionId;
      roomId = res.body.data.roomId;

      // Verify stored streamKey matches roomId
      const session = await CamSession.findById(sessionId);
      expect(session?.streamKey).toBe(roomId);
    });

    it('GET /api/adult/cams/:id/token returns token and roomId for viewer', async () => {
      const res = await request(app)
        .get(`/api/adult/cams/${sessionId}/token`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.body.roomId).toBe(roomId);
    });
  });

  describe('Random Matching', () => {
    it('POST /api/v1/adult/random/queue adds user to queue', async () => {
      const res = await request(app)
        .post('/api/v1/adult/random/queue')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ mode: 'video' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('waiting');
    });

    it('second user joining queue creates a match and saves to RandomMatch', async () => {
      const res = await request(app)
        .post('/api/v1/adult/random/queue')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ mode: 'video' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('matched');
      expect(res.body.data.matchId).toBeDefined();

      const match = await RandomMatch.findById(res.body.data.matchId);
      expect(match).toBeDefined();
      expect(match?.status).toBe('matched');
    });
  });
});

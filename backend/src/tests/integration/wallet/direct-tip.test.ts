import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import AdultUser from '../../../models/AdultUser';
import CreditTransaction from '../../../models/CreditTransaction';
import { socketService } from '../../../services/socketService';

describe('POST /api/v1/adult/wallet/tip', () => {
  let mongoServer: MongoMemoryReplSet;
  let memberToken: string;
  let memberId: string;
  let providerId: string;
  let providerToken: string;

  beforeAll(async () => {
    // Start MongoMemoryReplSet to support transactions
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections
    await AdultUser.deleteMany({});
    await CreditTransaction.deleteMany({});

    const member = await createVerifiedAdultMember();
    const provider = await createVerifiedAdultProvider();
    memberToken    = member.accessToken;
    memberId       = member.id;
    providerId     = provider.id;
    providerToken  = provider.accessToken;

    jest.restoreAllMocks();
  });

  // Helpers
  async function createVerifiedAdultMember() {
    const email = `member_${Date.now()}_${Math.floor(Math.random() * 1000)}@test.com`;
    const username = `member_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const member = new AdultUser({
      email,
      passwordHash: 'password123',
      username,
      displayName: 'Test Member',
      dateOfBirth: new Date('1990-01-01'),
      role: 'user',
      country: 'US',
      credits: 0,
      ageVerified: true,
      ageVerifiedAt: new Date()
    });
    await member.save();
    const token = jwt.sign({ sub: member._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    return {
      id: member._id.toString(),
      accessToken: token,
      user: member
    };
  }

  async function createVerifiedAdultProvider() {
    const email = `provider_${Date.now()}_${Math.floor(Math.random() * 1000)}@test.com`;
    const username = `provider_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const provider = new AdultUser({
      email,
      passwordHash: 'password123',
      username,
      displayName: 'Stage Name',
      dateOfBirth: new Date('1990-01-01'),
      role: 'provider',
      country: 'US',
      credits: 0,
      ageVerified: true,
      ageVerifiedAt: new Date(),
      status: 'active',
      isVerified: true,
      providerProfile: {
        stageName: 'Elena Rose',
        categories: ['live_cam'],
        isLive: true,
        pricePerMinute: 10,
        tipMinimum: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        contentTags: [],
        rating: { average: 5, count: 1 }
      }
    });
    await provider.save();
    const token = jwt.sign({ sub: provider._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    return {
      id: provider._id.toString(),
      accessToken: token,
      user: provider
    };
  }

  async function setWalletBalance(userId: string, balance: number) {
    await AdultUser.findByIdAndUpdate(userId, { credits: balance });
  }

  async function getWalletBalance(userId: string) {
    const user = await AdultUser.findById(userId);
    return user ? user.credits : 0;
  }

  async function sendTip(token: string, recipientId: string, amount: number, message?: string) {
    return await request(app)
      .post('/api/v1/adult/wallet/tip')
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientId, amount, message });
  }

  async function getLatestTransaction(userId: string) {
    return await CreditTransaction.findOne({ userId }).sort({ createdAt: -1 });
  }

  async function getTransactionCount(userId: string) {
    return await CreditTransaction.countDocuments({ userId });
  }

  async function getWalletDocument(userId: string) {
    const token = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
    const res = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${token}`);
    return res.body;
  }

  async function suspendUser(userId: string) {
    await AdultUser.findByIdAndUpdate(userId, { isActive: false });
  }

  async function getDatingToken() {
    return jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET || 'fallback_secret');
  }

  describe('Successful tip', () => {
    it('deducts credits from sender wallet', async () => {
      await setWalletBalance(memberId, 500);
      await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      const balance = await getWalletBalance(memberId);
      expect(balance).toBe(400);
    });

    it('adds credits to recipient wallet', async () => {
      await setWalletBalance(memberId, 500);
      const providerBefore = await getWalletBalance(providerId);
      await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      const providerAfter = await getWalletBalance(providerId);
      expect(providerAfter).toBe(providerBefore + 100);
    });

    it('returns 200 with tipId, newBalance, recipientName', async () => {
      await setWalletBalance(memberId, 500);
      const res = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tipId');
      expect(res.body.senderNewBalance).toBe(400);
      expect(res.body.amount).toBe(100);
      expect(res.body.recipientName).toBeTruthy();
    });

    it('creates a tip_sent transaction for sender', async () => {
      await setWalletBalance(memberId, 500);
      await sendTip(memberToken, providerId, 100);
      const tx = await getLatestTransaction(memberId);
      expect(tx).toBeTruthy();
      expect(tx!.type).toBe('tip_sent');
      expect(tx!.amount).toBe(-100);
      expect(tx!.status).toBe('completed');
    });

    it('creates a tip_received transaction for recipient', async () => {
      await setWalletBalance(memberId, 500);
      await sendTip(memberToken, providerId, 100);
      const tx = await getLatestTransaction(providerId);
      expect(tx).toBeTruthy();
      expect(tx!.type).toBe('tip_received');
      expect(tx!.amount).toBe(100);
      expect(tx!.status).toBe('completed');
    });

    it('increments sender lifetimeCreditsSpent', async () => {
      await setWalletBalance(memberId, 500);
      await sendTip(memberToken, providerId, 100);
      const wallet = await getWalletDocument(memberId);
      expect(wallet.lifetimeCreditsSpent).toBe(100);
    });

    it('includes optional message in transaction description', async () => {
      await setWalletBalance(memberId, 500);
      await sendTip(memberToken, providerId, 100, 'Love your content!');
      const tx = await getLatestTransaction(providerId);
      expect(tx).toBeTruthy();
      expect(tx!.description).toContain('Love your content!');
    });

    it('emits wallet:updated to sender via socket', async () => {
      await setWalletBalance(memberId, 500);
      const socketSpy = jest.spyOn(socketService, 'emitToUser');
      await sendTip(memberToken, providerId, 100);
      expect(socketSpy).toHaveBeenCalledWith(
        memberId,
        'wallet:updated',
        expect.objectContaining({ balance: 400 })
      );
    });

    it('emits wallet:updated to recipient via socket', async () => {
      await setWalletBalance(memberId, 500);
      const socketSpy = jest.spyOn(socketService, 'emitToUser');
      await sendTip(memberToken, providerId, 100);
      expect(socketSpy).toHaveBeenCalledWith(
        providerId,
        'wallet:updated',
        expect.any(Object)
      );
    });

    it('emits tip:received to recipient via socket', async () => {
      await setWalletBalance(memberId, 500);
      const socketSpy = jest.spyOn(socketService, 'emitToUser');
      await sendTip(memberToken, providerId, 100);
      expect(socketSpy).toHaveBeenCalledWith(
        providerId,
        'tip:received',
        expect.objectContaining({ amount: 100 })
      );
    });
  });

  describe('Insufficient credits', () => {
    it('returns 402 when sender has less than tip amount', async () => {
      await setWalletBalance(memberId, 50);
      const res = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      expect(res.status).toBe(402);
      expect(res.body.required).toBe(100);
      expect(res.body.current).toBe(50);
    });

    it('does NOT deduct any credits on 402', async () => {
      await setWalletBalance(memberId, 50);
      await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      const balance = await getWalletBalance(memberId);
      expect(balance).toBe(50);
    });

    it('does NOT create any transaction records on 402', async () => {
      await setWalletBalance(memberId, 50);
      await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: providerId, amount: 100 });
      const txCount = await getTransactionCount(memberId);
      expect(txCount).toBe(0);
    });
  });

  describe('Race condition — concurrent tips', () => {
    it('handles 5 concurrent tips of 60 credits each with balance of 200', async () => {
      await setWalletBalance(memberId, 200);
      const tips = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v1/adult/wallet/tip')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ recipientId: providerId, amount: 60 })
      );
      const results = await Promise.all(tips);
      const successes = results.filter(r => r.status === 200);
      const failures  = results.filter(r => r.status === 402);
      expect(successes).toHaveLength(3);   // 3 × 60 = 180 ≤ 200
      expect(failures).toHaveLength(2);    // 4th and 5th fail
      const finalBalance = await getWalletBalance(memberId);
      expect(finalBalance).toBe(20);       // 200 - 180 = 20, never negative
    });

    it('recipient balance is exactly correct after concurrent tips', async () => {
      await setWalletBalance(memberId, 200);
      const providerBefore = await getWalletBalance(providerId);
      const tips = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v1/adult/wallet/tip')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ recipientId: providerId, amount: 60 })
      );
      await Promise.all(tips);
      const providerAfter = await getWalletBalance(providerId);
      const successCount = 3;
      expect(providerAfter).toBe(providerBefore + (60 * successCount));
    });
  });

  describe('Validation', () => {
    it('returns 400 if amount is 0', async () => {
      const res = await sendTip(memberToken, providerId, 0);
      expect(res.status).toBe(400);
    });

    it('returns 400 if amount is negative', async () => {
      const res = await sendTip(memberToken, providerId, -50);
      expect(res.status).toBe(400);
    });

    it('returns 400 if amount exceeds 50000', async () => {
      await setWalletBalance(memberId, 100000);
      const res = await sendTip(memberToken, providerId, 50001);
      expect(res.status).toBe(400);
    });

    it('returns 400 if amount is not an integer', async () => {
      const res = await sendTip(memberToken, providerId, 10.5);
      expect(res.status).toBe(400);
    });

    it('returns 400 if message exceeds 150 chars', async () => {
      await setWalletBalance(memberId, 500);
      const res = await sendTip(memberToken, providerId, 50, 'A'.repeat(151));
      expect(res.status).toBe(400);
    });

    it('returns 403 if tipping yourself', async () => {
      const res = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ recipientId: memberId, amount: 50 });
      expect(res.status).toBe(403);
    });

    it('returns 403 if recipient does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await sendTip(memberToken, fakeId, 50);
      expect(res.status).toBe(403);
    });

    it('returns 403 if recipient is suspended', async () => {
      await suspendUser(providerId);
      const res = await sendTip(memberToken, providerId, 50);
      expect(res.status).toBe(403);
    });

    it('returns 429 after 20 tips in one hour', async () => {
      await setWalletBalance(memberId, 100000);
      for (let i = 0; i < 20; i++) {
        await sendTip(memberToken, providerId, 1);
      }
      const res = await sendTip(memberToken, providerId, 1);
      expect(res.status).toBe(429);
    });
  });

  describe('Authorization', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .send({ recipientId: providerId, amount: 50 });
      expect(res.status).toBe(401);
    });

    it('returns 403 with dating zone token', async () => {
      const datingToken = await getDatingToken();
      const res = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${datingToken}`)
        .send({ recipientId: providerId, amount: 50 });
      expect(res.status).toBe(403);
    });
  });
});

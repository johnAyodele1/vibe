import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import SpinWheel from '../models/SpinWheel';
import SpinResult from '../models/SpinResult';
import CamSession from '../models/CamSession';
import CreditTransaction from '../models/CreditTransaction';
import jwt from 'jsonwebtoken';

describe('Spin Wheel API', () => {
  let mongoServer: MongoMemoryReplSet;
  let memberToken: string;
  let providerToken: string;
  let memberUser: any;
  let providerUser: any;
  let camSessionId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.disconnect();
    await mongoose.connect(mongoUri);

    // Create a provider
    providerUser = new AdultUser({
      email: 'provider_wheel@test.com',
      passwordHash: 'hashedpassword',
      role: 'provider',
      username: 'provider_wheel',
      displayName: 'Provider Wheel',
      dateOfBirth: new Date(1995, 1, 1),
      country: 'United Kingdom',
      credits: 0,
      status: 'active',
      isVerified: true,
      providerProfile: {
        stageName: 'GoldenWheel',
        onboarding: { isComplete: true }
      }
    });
    await providerUser.save();

    providerToken = jwt.sign({ sub: providerUser._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a member
    memberUser = new AdultUser({
      email: 'member_wheel@test.com',
      passwordHash: 'hashedpassword',
      role: 'user',
      username: 'member_wheel',
      displayName: 'Member Wheel',
      dateOfBirth: new Date(1995, 1, 1),
      country: 'United Kingdom',
      credits: 500,
      status: 'active',
      isVerified: true
    });
    await memberUser.save();

    memberToken = jwt.sign({ sub: memberUser._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create active CamSession
    const camSession = new CamSession({
      providerId: providerUser._id,
      title: 'Spin Live Stream',
      streamKey: 'cam_wheel_stream',
      streamPlaybackUrl: 'cam_wheel_stream_playback',
      status: 'live',
      startedAt: new Date()
    });
    await camSession.save();
    camSessionId = camSession._id.toString();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('PUT /api/v1/adult/providers/me/wheel should fail with validation errors', async () => {
    // Less than 2 items
    let res = await request(app)
      .put('/api/v1/adult/providers/me/wheel')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        isActive: true,
        items: [
          { id: '1', label: 'Item 1', creditCost: 10, probability: 1, color: '#f00' }
        ]
      });
    expect(res.status).toBe(400);

    // Item label too long
    res = await request(app)
      .put('/api/v1/adult/providers/me/wheel')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        isActive: true,
        items: [
          { id: '1', label: 'Item 1'.repeat(20), creditCost: 10, probability: 1, color: '#f00' },
          { id: '2', label: 'Item 2', creditCost: 10, probability: 1, color: '#0f0' }
        ]
      });
    expect(res.status).toBe(400);

    // Cost less than 5
    res = await request(app)
      .put('/api/v1/adult/providers/me/wheel')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        isActive: true,
        items: [
          { id: '1', label: 'Item 1', creditCost: 4, probability: 1, color: '#f00' },
          { id: '2', label: 'Item 2', creditCost: 10, probability: 1, color: '#0f0' }
        ]
      });
    expect(res.status).toBe(400);
  });

  it('PUT /api/v1/adult/providers/me/wheel should configure and activate spin wheel successfully', async () => {
    const res = await request(app)
      .put('/api/v1/adult/providers/me/wheel')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        isActive: true,
        items: [
          { id: 'item_1', label: 'Item One', creditCost: 50, probability: 1, color: '#ff0000' },
          { id: 'item_2', label: 'Item Two', creditCost: 100, probability: 1, color: '#00ff00' }
        ]
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
  });

  it('GET /api/v1/adult/providers/:providerId/wheel should retrieve configured wheel', async () => {
    const res = await request(app)
      .get(`/api/v1/adult/providers/${providerUser._id}/wheel`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
  });

  it('POST /api/v1/adult/providers/:providerId/wheel/spin should pay and spin', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/providers/${providerUser._id}/wheel/spin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ camSessionId });
    if (res.status !== 200) {
      console.log('SPIN ERROR:', res.body || res.text);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.itemId).toBeDefined();
    expect(res.body.itemLabel).toBeDefined();
    expect(res.body.creditsPaid).toBeDefined();

    // Verify balances
    const freshMember = await AdultUser.findById(memberUser._id);
    const freshProvider = await AdultUser.findById(providerUser._id);
    const paid = res.body.creditsPaid as number;
    const toProvider = Math.floor(paid * 0.85);

    expect(freshMember?.credits).toBe(500 - paid);
    expect(freshProvider?.credits).toBe(toProvider);

    // Verify transaction entries
    const transactions = await CreditTransaction.find({ relatedUserId: providerUser._id });
    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions[0].amount).toBe(-paid);
  });

  it('GET /api/v1/adult/providers/me/wheel/stats should return analytics for provider', async () => {
    const res = await request(app)
      .get('/api/v1/adult/providers/me/wheel/stats')
      .set('Authorization', `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalSpins).toBe(1);
    expect(res.body.data.totalEarned).toBeGreaterThan(0);
    expect(res.body.data.recentSpins).toHaveLength(1);
  });
});

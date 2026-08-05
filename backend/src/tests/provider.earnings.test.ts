import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import AppConfig from '../models/AppConfig';
import jwt from 'jsonwebtoken';

describe('Provider Earnings & Payout API', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;
  let memberId: string;
  let adminToken: string;
  let activeRequestId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    await AppConfig.create({
      key: 'diamond_naira_rate',
      value: 100,
      label: 'Diamond to Naira Rate',
      description: 'Diamond exchange rate to Nigerian Naira'
    });

    // Create a provider user
    const provider = new AdultUser({
      email: 'lucia.earnings@vibe.com',
      passwordHash: 'password123',
      username: 'luciaearnings',
      displayName: 'Lucia Rose',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
      credits: 20000, // Starts with 20000 credits in their wallet
      providerProfile: {
        stageName: 'Lucia Gold',
        totalEarnings: 15000, // Accumulated 15000 credits over time
        pendingPayout: 0,
        verificationStatus: 'approved',
        payoutInfo: {
          method: 'bank',
          details: { bankName: 'GTBank', routingNumber: '123456789', accountNumber: '9876543211' }
        }
      }
    });
    await provider.save();
    providerId = provider._id.toString();

    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a regular member user
    const member = new AdultUser({
      email: 'member.tipper@vibe.com',
      passwordHash: 'password123',
      username: 'membertipper',
      displayName: 'Member Tipper',
      dateOfBirth: new Date('2000-01-01'),
      role: 'user',
      country: 'Nigeria',
    });
    await member.save();
    memberId = member._id.toString();

    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    adminToken = jwt.sign(
      { userId: 'admin123', isAdmin: true },
      process.env.JWT_SECRET || 'fallback_secret'
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('GET /api/v1/adult/providers/me/earnings returns default earnings if no transactions exist', async () => {
    const res = await request(app)
      .get('/api/v1/adult/providers/me/earnings')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalEarned).toBe(15000);
    expect(res.body.data.paidOut).toBe(0);
    // 15000 * 100 = 1500000
    expect(res.body.data.pending).toBe(1500000);
    expect(res.body.data.timeline).toHaveLength(6);
    expect(res.body.data.transactions).toHaveLength(0);
  });

  it('POST /api/v1/adult/providers/me/payout creates a queued request successfully', async () => {
    // Populate an actual eligible transaction for provider
    await CreditTransaction.create({
      userId: providerId,
      type: 'tip_received',
      amount: 15000,
      usdAmount: 112.5,
      nairaAmount: 1500000,
      description: 'Fan tips',
      status: 'completed',
      eligibleForPayout: true,
      paidOut: false
    });

    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.amount).toBe(15000);
    expect(res.body.status).toBe('queued');
    activeRequestId = res.body.requestId;
  });

  it('GET /api/v1/adult/providers/me/earnings reflects paid out after admin completes the queued request', async () => {
    // 1. Advance payout status queued -> verifying -> processing -> completed
    await request(app)
      .put(`/api/admin/payouts/${activeRequestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .put(`/api/admin/payouts/${activeRequestId}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .put(`/api/admin/payouts/${activeRequestId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reference: 'REF-BANK-999' })
      .expect(200);

    // 2. Now check provider earnings matches expected completed values
    const res = await request(app)
      .get('/api/v1/adult/providers/me/earnings')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalEarned).toBe(15000);
    expect(res.body.data.paidOut).toBe(1500000);
    expect(res.body.data.pending).toBe(0);
  });

  it('POST /api/v1/adult/providers/me/payout fails if pending payout is below threshold', async () => {
    // Now that previous transactions are paid out, eligible is 0
    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NO_ELIGIBLE_BALANCE');
  });
});

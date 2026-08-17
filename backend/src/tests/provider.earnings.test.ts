import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
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
      credits: 20000,
      providerProfile: {
        stageName: 'Lucia Gold',
        totalEarnings: 15000, // Lifetime total earnings accumulated
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

  it('GET /api/v1/adult/providers/me/earnings returns 0 period earnings if no transactions exist in the period, while preserving pending payout from lifetime earnings', async () => {
    const res = await request(app)
      .get('/api/v1/adult/providers/me/earnings?dateRange=This Month')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalEarned).toBe(0);
    expect(res.body.data.grossEarned).toBe(0);
    expect(res.body.data.platformFee).toBe(0);
    expect(res.body.data.paidOut).toBe(0);
    // Pending payout uses lifetime total earnings (15000 * 100 = 1500000)
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
      platformFee: 2647.06,
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

    const res = await request(app)
      .get('/api/v1/adult/providers/me/earnings?dateRange=This Month')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalEarned).toBe(15000);
    expect(res.body.data.paidOut).toBe(1500000);
    expect(res.body.data.pending).toBe(0);
  });

  it('POST /api/v1/adult/providers/me/payout fails if pending payout is below threshold', async () => {
    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NO_ELIGIBLE_BALANCE');
  });

  it('proves canonical aggregation consistency across Dashboard and Detailed Earnings endpoints', async () => {
    // Clear transactions for isolated test provider
    const p2 = new AdultUser({
      email: 'p2@vibe.com',
      passwordHash: 'pass',
      username: 'p2user',
      displayName: 'Provider Two',
      dateOfBirth: new Date('1992-01-01'),
      role: 'provider',
      country: 'Nigeria',
      credits: 5000,
      providerProfile: {
        stageName: 'Provider Two',
        totalEarnings: 3663.80, // Lifetime total in profile
        pendingPayout: 0,
        verificationStatus: 'approved'
      }
    });
    await p2.save();
    const p2Token = jwt.sign({ sub: p2._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    const now = new Date();

    // 1. Multiple legitimate earning types recorded this month
    await CreditTransaction.create({
      userId: p2._id,
      type: 'tip_received',
      amount: 850,
      platformFee: 150,
      usdAmount: 0,
      description: 'Tip received',
      status: 'completed',
      createdAt: now,
    });

    await CreditTransaction.create({
      userId: p2._id,
      type: 'call_earning',
      amount: 1700,
      platformFee: 300,
      usdAmount: 0,
      description: 'Call payout',
      status: 'completed',
      createdAt: now,
    });

    await CreditTransaction.create({
      userId: p2._id,
      type: 'service_payment_received',
      amount: 850,
      platformFee: 150,
      usdAmount: 0,
      description: 'Service request payment',
      status: 'completed',
      createdAt: now,
    });

    await CreditTransaction.create({
      userId: p2._id,
      type: 'paid_media_unlock',
      amount: 263.80,
      platformFee: 46.55,
      usdAmount: 0,
      description: 'Photo unlock',
      status: 'completed',
      createdAt: now,
    });

    await CreditTransaction.create({
      userId: p2._id,
      type: 'spin_wheel',
      amount: 76,
      platformFee: 13.41,
      usdAmount: 0,
      description: 'Spin wheel prize',
      status: 'completed',
      createdAt: now,
    });

    // 2. Non-earning positive transactions that MUST be excluded from earnings reports:
    await CreditTransaction.create({
      userId: p2._id,
      type: 'purchase',
      amount: 500,
      platformFee: 0,
      usdAmount: 0,
      description: 'Credit purchase',
      status: 'completed',
      createdAt: now,
    });

    await CreditTransaction.create({
      userId: p2._id,
      type: 'bonus',
      amount: 100,
      platformFee: 0,
      usdAmount: 0,
      description: 'Welcome bonus',
      status: 'completed',
      createdAt: now,
    });

    // 3. Transactions outside current month (must be excluded from This Month report)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await CreditTransaction.create({
      userId: p2._id,
      type: 'tip_received',
      amount: 1000,
      platformFee: 176.47,
      usdAmount: 0,
      description: 'Old tip',
      status: 'completed',
      createdAt: lastMonth,
    });

    // Fetch Dashboard stats
    const dashRes = await request(app)
      .get('/api/v1/adult/providers/me/dashboard')
      .set('Authorization', `Bearer ${p2Token}`)
      .expect(200);

    // Fetch Detailed Earnings report for "This Month"
    const earningsRes = await request(app)
      .get('/api/v1/adult/providers/me/earnings?dateRange=This Month')
      .set('Authorization', `Bearer ${p2Token}`)
      .expect(200);

    const expectedEarningSum = 850 + 1700 + 850 + 263.80 + 76; // = 3739.80
    const expectedPlatformFeeSum = 150 + 300 + 150 + 46.55 + 13.41; // = 659.96
    const expectedGrossSum = expectedEarningSum + expectedPlatformFeeSum; // = 4399.76

    // Assertion 1: Dashboard This Month and Detailed Earnings This Month return the EXACT SAME provider-net total
    expect(dashRes.body.data.stats.monthEarnings).toBeCloseTo(expectedEarningSum, 2);
    expect(earningsRes.body.data.totalEarned).toBeCloseTo(expectedEarningSum, 2);
    expect(dashRes.body.data.stats.monthEarnings).toEqual(earningsRes.body.data.totalEarned);

    // Assertion 2: Non-earning positive transactions (purchase 500, bonus 100) are excluded
    // (If non-earning txs were included, sum would be 4339.80; if lastMonth included, sum would be 4739.80)
    expect(dashRes.body.data.stats.monthEarnings).not.toBe(4339.80);
    expect(dashRes.body.data.stats.monthEarnings).not.toBe(4739.80);

    // Assertion 3: Platform fees and gross earnings are calculated from stored transaction data
    expect(earningsRes.body.data.platformFee).toBeCloseTo(expectedPlatformFeeSum, 2);
    expect(earningsRes.body.data.grossEarned).toBeCloseTo(expectedGrossSum, 2);

    // Assertion 4: Selected-period report does not accidentally use lifetime providerProfile.totalEarnings (3663.80)
    expect(earningsRes.body.data.totalEarned).not.toBe(p2.providerProfile!.totalEarnings);

    // Assertion 5: Transactions outside selected period are excluded when date range is Today
    const todayRes = await request(app)
      .get('/api/v1/adult/providers/me/earnings?dateRange=Today')
      .set('Authorization', `Bearer ${p2Token}`)
      .expect(200);

    expect(todayRes.body.data.totalEarned).toBeCloseTo(expectedEarningSum, 2);

    // Assertion 6: Multiple earning types are aggregated correctly
    expect(earningsRes.body.data.transactions).toHaveLength(7); // 7 txs created this month for p2 (excluding 1 lastMonth tx)
  });
});

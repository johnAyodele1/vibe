import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import AppConfig from '../models/AppConfig';
import jwt from 'jsonwebtoken';
import { calculateProviderBalanceBreakdown } from '../shared/earnings';

describe('Provider Earnings & Payout API', () => {
  let mongoServer: MongoMemoryReplSet;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;
  let memberId: string;
  let adminToken: string;
  let activeRequestId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
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
    expect(res.body.data.pending).toBe(0);
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
    await CreditTransaction.create({
      userId: providerId,
      type: 'tip_received',
      amount: 200,
      platformFee: 35.29,
      usdAmount: 1.5,
      nairaAmount: 20000,
      description: 'Small tip below threshold',
      status: 'completed',
      eligibleForPayout: true,
      paidOut: false
    });

    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('MINIMUM_THRESHOLD_NOT_MET');
  });

  describe('Comprehensive Accounting Invariants Test Matrix (Cases 1 - 19)', () => {
    let matrixProviderId: string;

    beforeEach(async () => {
      const p = new AdultUser({
        email: `matrix.${Date.now()}@vibe.com`,
        passwordHash: 'pass',
        username: `matrix_${Date.now()}`,
        displayName: 'Matrix Provider',
        dateOfBirth: new Date('1995-01-01'),
        role: 'provider',
        country: 'Nigeria',
        credits: 10000,
        providerProfile: {
          stageName: 'Matrix Gold',
          totalEarnings: 0,
          pendingPayout: 0,
          verificationStatus: 'approved',
          payoutInfo: {
            method: 'bank',
            details: { bankName: 'GTBank', accountNumber: '1234567890' }
          }
        }
      });
      await p.save();
      matrixProviderId = p._id.toString();
    });

    it('1. Lifetime earnings with zero payouts', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 1000,
        platformFee: 150,
        usdAmount: 7.5,
        description: 'Tip received',
        status: 'completed',
        eligibleForPayout: true
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(1000);
      expect(b.paidOutCredits).toBe(0);
      expect(b.earningsToBeClaimedCredits).toBe(1000);
      expect(b.withdrawableCredits).toBe(1000);
    });

    it('2 & 3 & 4. Lifetime accumulated balance remains unchanged after payout, but earningsToBeClaimed decreases', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 2000,
        platformFee: 300,
        usdAmount: 15,
        description: 'Tip received',
        status: 'completed',
        eligibleForPayout: true
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'payout',
        amount: -1200,
        usdAmount: -9,
        description: 'Payout',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(2000); // Lifetime balance unchanged
      expect(b.paidOutCredits).toBe(1200);
      expect(b.earningsToBeClaimedCredits).toBe(800); // 2000 - 1200
    });

    it('5 & 6. Unsettled earnings remain in earningsToBeClaimed but excluded from withdrawable', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'service_payment_received',
        amount: 1500,
        platformFee: 225,
        usdAmount: 11.25,
        description: 'Service request payment',
        status: 'completed',
        eligibleForPayout: false // Unsettled service
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.earningsToBeClaimedCredits).toBe(1500);
      expect(b.unsettledCredits).toBe(1500);
      expect(b.withdrawableCredits).toBe(0);
    });

    it('7. Disputed earnings excluded from withdrawable', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'service_payment_received',
        amount: 800,
        platformFee: 120,
        usdAmount: 6,
        description: 'Disputed service payment',
        status: 'completed',
        eligibleForPayout: false,
        inDispute: true
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.earningsToBeClaimedCredits).toBe(800);
      expect(b.disputedCredits).toBe(800);
      expect(b.withdrawableCredits).toBe(0);
    });

    it('8. Pending payout-request earnings remain in earningsToBeClaimed but not withdrawable', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 1000,
        platformFee: 150,
        usdAmount: 7.5,
        description: 'Tip in payout request',
        status: 'completed',
        eligibleForPayout: true,
        inPayoutRequest: new mongoose.Types.ObjectId()
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.earningsToBeClaimedCredits).toBe(1000);
      expect(b.unsettledCredits).toBe(1000);
      expect(b.withdrawableCredits).toBe(0);
    });

    it('9 & 10 & 11. Reversion decreases earningsToBeClaimed and multiple reversions reconcile', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'call_earning',
        amount: 1000,
        platformFee: 150,
        usdAmount: 7.5,
        description: 'Call earning',
        status: 'completed',
        eligibleForPayout: true
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'call_refund',
        amount: -200,
        usdAmount: -1.5,
        description: 'Call refund 1',
        status: 'completed'
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'call_refund',
        amount: -100,
        usdAmount: -0.75,
        description: 'Call refund 2',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(1000);
      expect(b.withdrawableCredits).toBe(700); // 1000 - 300
      expect(b.earningsToBeClaimedCredits).toBe(700);
    });

    it('12. Paid-out + reversion combinations reconcile', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 2000,
        platformFee: 300,
        usdAmount: 15,
        description: 'Tip received',
        status: 'completed',
        eligibleForPayout: true
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'payout',
        amount: -1000,
        usdAmount: -7.5,
        description: 'Payout',
        status: 'completed'
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'refund',
        amount: -200,
        usdAmount: -1.5,
        description: 'Refund',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(2000);
      expect(b.paidOutCredits).toBe(1000);
      expect(b.earningsToBeClaimedCredits).toBe(800); // 2000 - 1000 - 200
      expect(b.withdrawableCredits).toBe(800);
    });

    it('13 & 14. Invariant identity checks: earningsToBeClaimed === withdrawable + unsettled + disputed AND lifetimeProviderEarnings - paidOut - reversions', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 1000,
        platformFee: 150,
        usdAmount: 7.5,
        description: 'Tip received',
        status: 'completed',
        eligibleForPayout: true
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'service_payment_received',
        amount: 500,
        platformFee: 75,
        usdAmount: 3.75,
        description: 'Service payment',
        status: 'completed',
        eligibleForPayout: false // Unsettled
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'service_payment_received',
        amount: 300,
        platformFee: 45,
        usdAmount: 2.25,
        description: 'Disputed service payment',
        status: 'completed',
        eligibleForPayout: false,
        inDispute: true
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'payout',
        amount: -400,
        usdAmount: -3,
        description: 'Payout',
        status: 'completed'
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'call_refund',
        amount: -100,
        usdAmount: -0.75,
        description: 'Call refund',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);

      // Invariant 3: earningsToBeClaimed === withdrawable + unsettled + disputed
      expect(b.earningsToBeClaimedCredits).toBe(b.withdrawableCredits + b.unsettledCredits + b.disputedCredits);

      // Invariant 2: earningsToBeClaimed === lifetimeProviderEarnings - paidOut - reversions
      // Lifetime gross = 1800 net. Paid out = 400. Reversions = 100. Expected claimable = 1300.
      expect(b.earningsToBeClaimedCredits).toBe(1800 - 400 - 100);
    });

    it('15. Total Accumulated Balance remains lifetime earnings regardless of payouts', async () => {
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 5000,
        platformFee: 750,
        usdAmount: 37.5,
        description: 'Large tip',
        status: 'completed'
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'payout',
        amount: -4500,
        usdAmount: -33.75,
        description: 'Payout',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(5000);
    });

    it('16 & 17 & 18. Payout threshold boundary checks (499 rejected, 500 accepted, requested amount threshold)', async () => {
      const matrixToken = jwt.sign({ sub: matrixProviderId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

      // 499 diamond eligible balance
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 499,
        platformFee: 74.85,
        usdAmount: 3.74,
        description: 'Tip 499',
        status: 'completed',
        eligibleForPayout: true
      });

      const res499 = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${matrixToken}`)
        .expect(400);

      expect(res499.body.error).toBe('MINIMUM_THRESHOLD_NOT_MET');

      // Top up to 1000 total eligible balance
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 501,
        platformFee: 75.15,
        usdAmount: 3.76,
        description: 'Tip 501',
        status: 'completed',
        eligibleForPayout: true
      });

      // Requesting 400 diamonds when 1000 is available -> rejected because requested amount < 500
      const resReq400 = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${matrixToken}`)
        .send({ amount: 400 })
        .expect(400);

      expect(resReq400.body.error).toBe('MINIMUM_THRESHOLD_NOT_MET');

      // Requesting 500 diamonds -> accepted
      const res500 = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${matrixToken}`)
        .send({ amount: 500 })
        .expect(201);

      expect(res500.body.success).toBe(true);
      expect(res500.body.amount).toBe(500);
    });

    it('19. Non-payout negative transaction types not misclassified as reversions', async () => {
      // Create a user purchase or spend transaction that is negative (e.g. spend/withdrawal)
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'tip_received',
        amount: 1000,
        platformFee: 150,
        usdAmount: 7.5,
        description: 'Tip received',
        status: 'completed'
      });

      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'spend',
        amount: -200,
        usdAmount: -1.5,
        description: 'Spend',
        status: 'completed'
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.totalAccumulatedCredits).toBe(1000); // spend does not count as a provider earning reversion
    });

    it('20. Unsettled earnings remain intact and positive when provider has prior completed payouts', async () => {
      // Prior payout of 15000 diamonds
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'payout',
        amount: -15000,
        usdAmount: -112.5,
        description: 'Prior payout',
        status: 'completed'
      });

      // New pending/unsettled service payment of 1500 diamonds
      await CreditTransaction.create({
        userId: matrixProviderId,
        type: 'service_payment_received',
        amount: 1500,
        platformFee: 225,
        usdAmount: 11.25,
        description: 'Service tonight payment',
        status: 'completed',
        eligibleForPayout: false // Unsettled
      });

      const b = await calculateProviderBalanceBreakdown(matrixProviderId);
      expect(b.unsettledCredits).toBe(1500);
      expect(b.unsettledNaira).toBe(1500 * b.rate);
      expect(b.withdrawableCredits).toBe(0);
      expect(b.earningsToBeClaimedCredits).toBe(1500);
    });
  });
});

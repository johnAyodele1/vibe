import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import PlatformEarning from '../models/PlatformEarning';
import PayoutRequest from '../models/PayoutRequest';
import CustomerRefund from '../models/CustomerRefund';
import CreditTransaction from '../models/CreditTransaction';
import AppConfig from '../models/AppConfig';
import { deleteCache } from '../config/redisFallback';
import { calculateFees } from '../shared/fees';

describe('Admin accounting analytics', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    process.env.ADMIN_EMAIL = 'admin@test.com';
    process.env.ADMIN_PASSWORD = 'adminpassword';
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      PlatformEarning.deleteMany({}),
      PayoutRequest.deleteMany({}),
      CustomerRefund.deleteMany({}),
      CreditTransaction.deleteMany({}),
      AppConfig.deleteMany({ key: 'diamond_naira_rate' }),
    ]);

    await deleteCache('config:diamond_naira_rate');
    await AppConfig.create({
      key: 'diamond_naira_rate',
      value: 200,
      label: 'Diamond to Naira Rate',
      description: 'Test rate',
    });

    const login = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'adminpassword' });
    adminToken = login.body.data.token;
  });

  const createPendingPayout = async () => {
    const providerId = new mongoose.Types.ObjectId();

    await PayoutRequest.create({
      providerId,
      providerName: 'Provider',
      amount: 500,
      amountNaira: 50000,
      nairaRateSnapshot: 100,
      status: 'processing',
      payoutMethod: 'bank',
      payoutDetails: {
        bankName: 'Test Bank',
        accountHolder: 'Provider',
        accountNumber: '1234567890',
      },
      requestedAt: new Date(),
      eligibleTransactionIds: [],
    });

    await mongoose.connection.collection('adultusers').insertOne({
      _id: providerId,
      email: `accounting-provider-${providerId}@test.local`,
      username: `accounting_provider_${providerId.toString().slice(-8)}`,
      role: 'provider',
      credits: 25000,
    });
  };

  it('reports pending payout requests instead of summing provider wallets on the accounting endpoint', async () => {
    await createPendingPayout();

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.pendingPayouts).toBe(500);
    expect(res.body.accounting.pendingPayoutsNaira).toBe(50000);
    expect(res.body.accounting.pendingPayoutCount).toBe(1);
  });

  it('reports pending payout liability correctly on /analytics/overview', async () => {
    await createPendingPayout();

    const res = await request(app)
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.earnings.pendingPayouts).toBe(500);
    expect(res.body.earnings.pendingPayoutsNaira).toBe(50000);
    expect(res.body.earnings.pendingPayouts).not.toBe(25000);
  });

  it('uses stored historical Naira values instead of the current diamond rate', async () => {
    await PlatformEarning.create({
      source: 'tip',
      amount: 1000,
      nairaValue: 100000,
      referenceId: new mongoose.Types.ObjectId(),
    });

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(200);
    expect(res.body.accounting.recordedGrossPlatformFees).toBe(1000);
    expect(res.body.accounting.recordedGrossPlatformFeesNaira).toBe(100000);
    expect(res.body.accounting.currentPlatformEarnings).toBe(1000);
    expect(res.body.accounting.currentPlatformEarningsNaira).toBe(100000);
  });

  it('does not subtract a platform reversal twice when the reversal is already recorded as a negative PlatformEarning', async () => {
    const txId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const providerId = new mongoose.Types.ObjectId();

    await PlatformEarning.create([
      { source: 'tip', amount: 1000, nairaValue: 100000, referenceId: txId },
      { source: 'service', amount: -75, nairaValue: -7500, referenceId: txId },
    ]);

    await CustomerRefund.create({
      originalTxId: txId,
      customerId,
      providerId,
      amount: 500,
      providerAmountReverted: 425,
      platformFeeReverted: 75,
      status: 'REFUND_COMPLETED',
      completedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.recordedGrossPlatformFees).toBe(1000);
    expect(res.body.accounting.recordedGrossPlatformFeesNaira).toBe(100000);
    expect(res.body.accounting.revertedPlatformFees).toBe(75);
    expect(res.body.accounting.revertedPlatformFeesNaira).toBe(7500);
    expect(res.body.accounting.currentPlatformEarnings).toBe(925);
    expect(res.body.accounting.currentPlatformEarningsNaira).toBe(92500);
    expect(res.body.accounting.customerRefunded).toBe(500);
    expect(res.body.accounting.providerReverted).toBe(425);
    expect(res.body.accounting.refundCount).toBe(1);
  });

  it('verifies platform fee reconciliation against production calculateFees and actual provider spend', async () => {
    const totalSpend = 1000;
    const { providerAmount, platformFee } = calculateFees(totalSpend);
    expect(providerAmount).toBe(850);
    expect(platformFee).toBe(150);

    const providerId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    const tx = await CreditTransaction.create({
      userId: providerId,
      type: 'tip_received',
      amount: providerAmount,
      platformFee: platformFee,
      usdAmount: 0,
      nairaAmount: 85000, // 850 diamonds @ 100 rate
      description: 'Tip received from member',
      relatedUserId: memberId,
      status: 'completed',
    });

    await PlatformEarning.create({
      source: 'tip',
      amount: platformFee,
      nairaValue: 15000,
      fromUserId: memberId,
      toProviderId: providerId,
      referenceId: tx._id,
    });

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.totalMoneySpentOnPlatform).toBe(1000);
    expect(res.body.accounting.totalMoneySpentOnPlatformNaira).toBe(100000);
    expect(res.body.accounting.expectedPlatformFees).toBe(150);
    expect(res.body.accounting.expectedPlatformFeesNaira).toBe(15000);
    expect(res.body.accounting.recordedGrossPlatformFees).toBe(150);
    expect(res.body.accounting.recordedGrossPlatformFeesNaira).toBe(15000);
    expect(res.body.accounting.currentPlatformEarnings).toBe(150);
    expect(res.body.accounting.reconciliationDifference).toBe(0);
  });

  it('verifies credit purchases are tracked separately and not counted as platform spend or multiplied by 15%', async () => {
    const memberId = new mongoose.Types.ObjectId();

    await CreditTransaction.create({
      userId: memberId,
      type: 'purchase',
      amount: 500,
      usdAmount: 0,
      nairaAmount: 50000,
      description: 'Purchased 500 credits',
      status: 'completed',
    });

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.completedPurchaseCredits).toBe(500);
    expect(res.body.accounting.completedPurchaseNaira).toBe(50000);
    expect(res.body.accounting.completedPurchaseCount).toBe(1);
    expect(res.body.accounting.totalMoneySpentOnPlatform).toBe(0);
    expect(res.body.accounting.expectedPlatformFees).toBe(0);
    expect(res.body.accounting.recordedGrossPlatformFees).toBe(0);
  });

  it('verifies payout state separation between pending, completed, and rejected payouts', async () => {
    const providerId = new mongoose.Types.ObjectId();

    await PayoutRequest.create([
      {
        providerId,
        providerName: 'Provider 1',
        amount: 300,
        amountNaira: 30000,
        nairaRateSnapshot: 100,
        status: 'queued',
        payoutMethod: 'bank',
        payoutDetails: {},
        requestedAt: new Date(),
        eligibleTransactionIds: [],
      },
      {
        providerId,
        providerName: 'Provider 1',
        amount: 800,
        amountNaira: 80000,
        nairaRateSnapshot: 100,
        status: 'completed',
        payoutMethod: 'bank',
        payoutDetails: {},
        requestedAt: new Date(),
        completedAt: new Date(),
        eligibleTransactionIds: [],
      },
      {
        providerId,
        providerName: 'Provider 1',
        amount: 200,
        amountNaira: 20000,
        nairaRateSnapshot: 100,
        status: 'rejected',
        rejectedReason: 'Invalid bank account',
        payoutMethod: 'bank',
        payoutDetails: {},
        requestedAt: new Date(),
        rejectedAt: new Date(),
        eligibleTransactionIds: [],
      },
    ]);

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.pendingPayouts).toBe(300);
    expect(res.body.accounting.pendingPayoutsNaira).toBe(30000);
    expect(res.body.accounting.pendingPayoutCount).toBe(1);
    expect(res.body.accounting.completedPayouts).toBe(800);
    expect(res.body.accounting.completedPayoutsNaira).toBe(80000);
    expect(res.body.accounting.rejectedPayouts).toBe(200);
    expect(res.body.accounting.rejectedPayoutsNaira).toBe(20000);
  });

  it('verifies changing current diamond rate does not alter historical accounting values', async () => {
    await PlatformEarning.create({
      source: 'call',
      amount: 30,
      nairaValue: 3000, // stored when rate was 100
      referenceId: new mongoose.Types.ObjectId(),
    });

    await AppConfig.findOneAndUpdate(
      { key: 'diamond_naira_rate' },
      { $set: { value: 500 } }
    );
    await deleteCache('config:diamond_naira_rate');

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(500);
    expect(res.body.accounting.recordedGrossPlatformFees).toBe(30);
    expect(res.body.accounting.recordedGrossPlatformFeesNaira).toBe(3000); // preserves historical 3000, not 30 * 500 = 15000
  });

  it('verifies /api/admin/analytics/earnings/daily returns actual aggregated transaction volume', async () => {
    const providerId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    await CreditTransaction.create({
      userId: providerId,
      type: 'call_earning',
      amount: 85,
      platformFee: 15,
      usdAmount: 0,
      nairaAmount: 8500,
      description: 'Call earning',
      relatedUserId: memberId,
      status: 'completed',
      createdAt: new Date(),
    });

    const todayStr = new Date().toISOString().slice(0, 10);

    const res = await request(app)
      .get(`/api/admin/analytics/earnings/daily?from=${todayStr}&to=${todayStr}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const todayData = res.body.data[0];
    expect(todayData.memberSpend).toBe(100);
    expect(todayData.providerEarnings).toBe(85);
    expect(todayData.platformFees).toBe(15);
  });
});

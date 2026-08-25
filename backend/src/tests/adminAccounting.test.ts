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
    expect(res.body.accounting.grossPlatformFees).toBe(1000);
    expect(res.body.accounting.grossPlatformFeesNaira).toBe(100000);
    expect(res.body.accounting.netPlatformFees).toBe(1000);
    expect(res.body.accounting.netPlatformFeesNaira).toBe(100000);
  });

  it('does not subtract a platform reversal twice when the reversal is already recorded as a negative PlatformEarning', async () => {
    const txId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const providerId = new mongoose.Types.ObjectId();

    await PlatformEarning.create([
      {
        source: 'tip',
        amount: 1000,
        nairaValue: 100000,
        referenceId: txId,
      },
      {
        source: 'service',
        amount: -75,
        nairaValue: -7500,
        referenceId: txId,
      },
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
    expect(res.body.accounting.grossPlatformFees).toBe(1000);
    expect(res.body.accounting.grossPlatformFeesNaira).toBe(100000);
    expect(res.body.accounting.revertedPlatformFees).toBe(75);
    expect(res.body.accounting.revertedPlatformFeesNaira).toBe(7500);
    expect(res.body.accounting.netPlatformFees).toBe(925);
    expect(res.body.accounting.netPlatformFeesNaira).toBe(92500);
    expect(res.body.accounting.customerRefunded).toBe(500);
    expect(res.body.accounting.providerReverted).toBe(425);
    expect(res.body.accounting.refundCount).toBe(1);
  });
});
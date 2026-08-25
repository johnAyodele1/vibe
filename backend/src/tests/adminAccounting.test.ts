import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import PlatformEarning from '../models/PlatformEarning';
import PayoutRequest from '../models/PayoutRequest';
import CustomerRefund from '../models/CustomerRefund';
import CreditTransaction from '../models/CreditTransaction';

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
    ]);

    const login = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'adminpassword' });
    adminToken = login.body.data.token;
  });

  it('reports pending payout requests instead of summing provider wallets', async () => {
    const providerId = new mongoose.Types.ObjectId();

    await PayoutRequest.create({
      providerId,
      providerName: 'Provider',
      amount: 500,
      amountNaira: 50000,
      nairaRateSnapshot: 100,
      status: 'processing',
      payoutMethod: 'bank',
      payoutDetails: { bankName: 'Test Bank', accountHolder: 'Provider', accountNumber: '1234567890' },
      requestedAt: new Date(),
      eligibleTransactionIds: [],
    });

    const providerWalletCredit = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('adultusers').insertOne({
      _id: providerWalletCredit,
      role: 'provider',
      credits: 25000,
    });

    const res = await request(app)
      .get('/api/admin/analytics/accounting')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accounting.pendingPayouts).toBe(500);
    expect(res.body.accounting.pendingPayoutsNaira).toBe(50000);
    expect(res.body.accounting.pendingPayoutCount).toBe(1);
  });

  it('separates gross, reverted, and net platform fees', async () => {
    const txId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const providerId = new mongoose.Types.ObjectId();

    await PlatformEarning.create({
      source: 'tip',
      amount: 1000,
      nairaValue: 100000,
      referenceId: txId,
    });

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
    expect(res.body.accounting.revertedPlatformFees).toBe(75);
    expect(res.body.accounting.netPlatformFees).toBe(925);
    expect(res.body.accounting.customerRefunded).toBe(500);
    expect(res.body.accounting.providerReverted).toBe(425);
    expect(res.body.accounting.refundCount).toBe(1);
  });
});

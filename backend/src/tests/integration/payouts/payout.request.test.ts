import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import AdultUser from '../../../models/AdultUser';
import CreditTransaction from '../../../models/CreditTransaction';
import PayoutRequest from '../../../models/PayoutRequest';
import AppConfig from '../../../models/AppConfig';

describe('Payout Request — Full Integration Suite', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let providerId: string;
  let memberToken: string;
  let memberId: string;
  let adminToken: string;
  let invalidAdminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialise config
    await AppConfig.deleteMany({});
    await AppConfig.create({
      key: 'diamond_naira_rate',
      value: 100,
      label: 'Diamond to Naira Rate',
      description: 'Diamond exchange rate to Nigerian Naira'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await CreditTransaction.deleteMany({});
    await PayoutRequest.deleteMany({});

    // Create a provider
    const provider = new AdultUser({
      email: 'provider@vibe.com',
      passwordHash: 'hashedpassword',
      username: 'provider_user',
      displayName: 'Provider Stage Name',
      role: 'provider',
      credits: 2000,
      country: 'Nigeria',
      dateOfBirth: new Date('1990-01-01'),
      providerProfile: {
        stageName: 'Lucia Rose',
        totalEarnings: 1500,
        pendingPayout: 0,
        verificationStatus: 'approved',
        payoutInfo: {
          method: 'bank',
          details: {
            bankName: 'GTBank',
            accountHolder: 'Lucia Rose',
            accountNumber: '0123456789',
            routingNumber: '12345',
            accountType: 'savings'
          }
        }
      }
    });
    await provider.save();
    providerId = provider._id.toString();

    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a member
    const member = new AdultUser({
      email: 'member@vibe.com',
      passwordHash: 'hashedpassword',
      username: 'member_user',
      displayName: 'Standard Member',
      role: 'user',
      credits: 500,
      country: 'Nigeria',
      dateOfBirth: new Date('1995-01-01'),
    });
    await member.save();
    memberId = member._id.toString();

    memberToken = jwt.sign({ sub: memberId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Admin token with isAdmin claim
    adminToken = jwt.sign(
      { userId: 'admin123', isAdmin: true },
      process.env.JWT_SECRET || 'fallback_secret'
    );

    // Invalid admin token (valid secret, but isAdmin is false)
    invalidAdminToken = jwt.sign(
      { userId: 'user123', isAdmin: false },
      process.env.JWT_SECRET || 'fallback_secret'
    );
  });

  describe('GET /api/v1/adult/providers/me/payout/eligible', () => {
    it('returns sum of all eligible unpaid transactions and breakdown by source', async () => {
      // Create some credit transactions
      await CreditTransaction.create([
        {
          userId: providerId,
          type: 'tip_received',
          amount: 500,
          usdAmount: 3.75,
          nairaAmount: 50000,
          description: 'Tip from fan',
          status: 'completed',
          eligibleForPayout: true,
          paidOut: false
        },
        {
          userId: providerId,
          type: 'call_earning',
          amount: 300,
          usdAmount: 2.25,
          nairaAmount: 30000,
          description: 'Video call',
          status: 'completed',
          eligibleForPayout: true,
          paidOut: false
        },
        {
          userId: providerId,
          type: 'payout',
          amount: -200,
          usdAmount: -1.5,
          nairaAmount: -20000,
          description: 'Past payout',
          status: 'completed',
          eligibleForPayout: false,
          paidOut: true
        }
      ]);

      const res = await request(app)
        .get('/api/v1/adult/providers/me/payout/eligible')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.eligibleAmount).toBe(800);
      expect(res.body.eligibleNaira).toBe(80000);
      expect(res.body.eligibleTransactionIds).toHaveLength(2);
      expect(res.body.breakdown.tips).toBe(500);
      expect(res.body.breakdown.calls).toBe(300);
    });

    it('returns 0 when no eligible transactions exist', async () => {
      const res = await request(app)
        .get('/api/v1/adult/providers/me/payout/eligible')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.eligibleAmount).toBe(0);
      expect(res.body.breakdown.tips).toBe(0);
    });
  });

  describe('POST /api/v1/adult/providers/me/payout/request', () => {
    it('creates a payout request with status "queued" and correct queue position', async () => {
      // Create some eligible transactions
      const tx = await CreditTransaction.create({
        userId: providerId,
        type: 'tip_received',
        amount: 1000,
        usdAmount: 7.5,
        nairaAmount: 100000,
        description: 'Large tip',
        status: 'completed',
        eligibleForPayout: true,
        paidOut: false
      });

      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.amount).toBe(1000);
      expect(res.body.amountNaira).toBe(100000);
      expect(res.body.queuePosition).toBe(1);
      expect(res.body.status).toBe('queued');

      // Verify transaction was marked as inPayoutRequest
      const updatedTx = await CreditTransaction.findById(tx._id);
      expect(updatedTx?.inPayoutRequest).toBeDefined();
      expect(updatedTx?.inPayoutRequest?.toString()).toBe(res.body.requestId);
    });

    it('returns 400 when provider has no payout method set up', async () => {
      // Remove payout details
      await AdultUser.findByIdAndUpdate(providerId, {
        $set: { 'providerProfile.payoutInfo': { method: 'pending', details: {} } }
      });

      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(400);

      expect(res.body.error).toBe('PAYOUT_METHOD_NOT_SET');
      expect(res.body.action).toBe('Go to Settings → Payout Settings');
    });

    it('returns 409 when an active payout request already exists', async () => {
      // Create transactions
      await CreditTransaction.create({
        userId: providerId,
        type: 'tip_received',
        amount: 1000,
        usdAmount: 7.5,
        description: 'Large tip',
        status: 'completed'
      });

      // Create existing active request
      await PayoutRequest.create({
        providerId,
        providerName: 'Lucia Rose',
        amount: 500,
        amountNaira: 50000,
        nairaRateSnapshot: 100,
        status: 'queued',
        payoutMethod: 'bank',
        payoutDetails: {},
        eligibleTransactionIds: [new mongoose.Types.ObjectId()]
      });

      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(409);

      expect(res.body.error).toBe('REQUEST_ALREADY_PENDING');
    });

    it('returns 400 when eligible balance is zero', async () => {
      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(400);

      expect(res.body.error).toBe('NO_ELIGIBLE_BALANCE');
    });

    it('rejects non-provider accounts (403)', async () => {
      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('partial amount request works correctly', async () => {
      await CreditTransaction.create([
        {
          userId: providerId,
          type: 'tip_received',
          amount: 1500,
          usdAmount: 11.25,
          nairaAmount: 150000,
          description: 'Big tip',
          status: 'completed',
          eligibleForPayout: true,
          paidOut: false
        }
      ]);

      const res = await request(app)
        .post('/api/v1/adult/providers/me/payout/request')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ amount: 1000 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.amount).toBe(1000);
      expect(res.body.amountNaira).toBe(100000);
    });
  });

  describe('GET /api/v1/adult/providers/me/payout/status', () => {
    it('returns null when no active payout request exists', async () => {
      const res = await request(app)
        .get('/api/v1/adult/providers/me/payout/status')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('returns current active request with live queue position', async () => {
      const req1 = await PayoutRequest.create({
        providerId: new mongoose.Types.ObjectId(),
        providerName: 'Other Provider',
        amount: 500,
        amountNaira: 50000,
        nairaRateSnapshot: 100,
        status: 'queued',
        payoutMethod: 'bank',
        payoutDetails: {},
        eligibleTransactionIds: [],
        requestedAt: new Date(Date.now() - 60000)
      });

      const req2 = await PayoutRequest.create({
        providerId,
        providerName: 'Lucia Rose',
        amount: 800,
        amountNaira: 80000,
        nairaRateSnapshot: 100,
        status: 'queued',
        payoutMethod: 'bank',
        payoutDetails: {},
        eligibleTransactionIds: [],
        requestedAt: new Date()
      });

      const res = await request(app)
        .get('/api/v1/adult/providers/me/payout/status')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(req2._id.toString());
      expect(res.body.data.queuePosition).toBe(2);
      expect(res.body.data.estimatedTime).toBeDefined();
    });
  });

  describe('Admin actions on payouts', () => {
    let payoutId: string;
    let txId: string;

    beforeEach(async () => {
      const tx = await CreditTransaction.create({
        userId: providerId,
        type: 'tip_received',
        amount: 1200,
        usdAmount: 9.0,
        nairaAmount: 120000,
        description: 'Tip',
        status: 'completed',
        eligibleForPayout: true,
        paidOut: false
      });
      txId = tx._id.toString();

      const payout = await PayoutRequest.create({
        providerId,
        providerName: 'Lucia Rose',
        amount: 1200,
        amountNaira: 120000,
        nairaRateSnapshot: 100,
        status: 'queued',
        payoutMethod: 'bank',
        payoutDetails: {
          bankName: 'GTBank',
          accountHolder: 'Lucia Rose',
          accountNumber: '0123456789'
        },
        eligibleTransactionIds: [tx._id]
      });
      payoutId = payout._id.toString();

      await CreditTransaction.updateOne({ _id: tx._id }, { $set: { inPayoutRequest: payout._id } });
    });

    it('prevents non-admin accounts from accessing admin endpoints (403)', async () => {
      await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${invalidAdminToken}`)
        .expect(403);
    });

    it('PUT verify moves queued → verifying', async () => {
      const res = await request(app)
        .put(`/api/admin/payouts/${payoutId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('verifying');
      expect(res.body.data.verifyingAt).toBeDefined();
    });

    it('PUT process moves verifying → processing', async () => {
      await PayoutRequest.updateOne({ _id: payoutId }, { $set: { status: 'verifying' } });

      const res = await request(app)
        .put(`/api/admin/payouts/${payoutId}/process`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('processing');
      expect(res.body.data.processingAt).toBeDefined();
    });

    it('PUT complete deducts credits, marks transactions paidOut, and completes request', async () => {
      await PayoutRequest.updateOne({ _id: payoutId }, { $set: { status: 'processing' } });

      const res = await request(app)
        .put(`/api/admin/payouts/${payoutId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reference: 'REF-BANK-999' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.adminReference).toBe('REF-BANK-999');

      // Check provider credit deduction
      const updatedProvider = await AdultUser.findById(providerId);
      expect(updatedProvider?.credits).toBe(800); // 2000 - 1200

      // Check covered transactions marked as paidOut
      const updatedTx = await CreditTransaction.findById(txId);
      expect(updatedTx?.paidOut).toBe(true);
    });

    it('PUT reject returns transactions to eligible state and sets reason', async () => {
      const res = await request(app)
        .put(`/api/admin/payouts/${payoutId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Incorrect account details provided.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectedReason).toBe('Incorrect account details provided.');

      // Check covered transactions unfrozen (inPayoutRequest unset)
      const updatedTx = await CreditTransaction.findById(txId);
      expect(updatedTx?.inPayoutRequest).toBeUndefined();
    });

    it('reject fails if no reason is provided', async () => {
      await request(app)
        .put(`/api/admin/payouts/${payoutId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '' })
        .expect(400);
    });
  });
});

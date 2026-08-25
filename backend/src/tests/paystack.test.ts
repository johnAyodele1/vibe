import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import { PaystackService } from '../services/paystack.service';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

describe('Paystack Wallet Credit Purchases', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_mock_paystack_secret_key';
    process.env.ADULT_JWT_SECRET = 'adult_secret';

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  }, 30000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await AdultUser.deleteMany({});
      await CreditTransaction.deleteMany({});
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await CreditTransaction.deleteMany({});

    const user = await AdultUser.create({
      email: 'member_paystack@test.com',
      passwordHash: 'hashedpassword',
      role: 'user',
      username: 'paystackuser',
      displayName: 'Paystack User',
      ageVerified: true,
      dateOfBirth: new Date('1995-01-01'),
      country: 'NG',
      credits: 0,
      subscriptionTier: 'none',
      isActive: true,
      isBanned: false,
      twoFactorEnabled: false,
      emailVerified: true,
    });

    userId = user._id.toString();

    userToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  describe('Package Pricing & Custom Amount Validation', () => {
    it('should correctly initialize predefined packages with exact diamond conversion (₦100 = 1 diamond)', async () => {
      // Starter: 800 NGN -> 8 diamonds
      const resStarter = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'starter' });

      expect(resStarter.status).toBe(200);
      expect(resStarter.body.amountNaira).toBe(800);
      expect(resStarter.body.diamonds).toBe(8);

      // Popular: 2,000 NGN -> 20 diamonds
      const resPopular = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'popular' });

      expect(resPopular.status).toBe(200);
      expect(resPopular.body.amountNaira).toBe(2000);
      expect(resPopular.body.diamonds).toBe(20);

      // Premium: 10,000 NGN -> 100 diamonds
      const resPremium = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'premium' });

      expect(resPremium.status).toBe(200);
      expect(resPremium.body.amountNaira).toBe(10000);
      expect(resPremium.body.diamonds).toBe(100);

      // Elite: 50,000 NGN -> 500 diamonds
      const resElite = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'elite' });

      expect(resElite.status).toBe(200);
      expect(resElite.body.amountNaira).toBe(50000);
      expect(resElite.body.diamonds).toBe(500);
    });

    it('should correctly handle custom amount purchase (min ₦1,000) and convert at ₦100 = 1 diamond', async () => {
      const resCustom = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amountNaira: 2500 });

      expect(resCustom.status).toBe(200);
      expect(resCustom.body.amountNaira).toBe(2500);
      expect(resCustom.body.diamonds).toBe(25);
    });

    it('should reject custom amounts below ₦1,000 or invalid values', async () => {
      const resBelowMin = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amountNaira: 999 });

      expect(resBelowMin.status).toBe(400);

      const resZero = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amountNaira: 0 });

      expect(resZero.status).toBe(400);

      const resNegative = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amountNaira: -5000 });

      expect(resNegative.status).toBe(400);

      const resFloat = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amountNaira: 1500.5 });

      expect(resFloat.status).toBe(400);
    });
  });

  describe('Verification and Wallet Crediting', () => {
    it('should verify transaction server-side and credit user wallet exactly once', async () => {
      const initRes = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'popular' });

      const ref = initRes.body.reference;

      const verifyRes = await request(app)
        .get(`/api/v1/adult/wallet/paystack/verify/${ref}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.status).toBe('completed');
      expect(verifyRes.body.diamonds).toBe(20);

      const user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(20);

      const tx = await CreditTransaction.findOne({ paymentIntentId: ref });
      expect(tx?.status).toBe('completed');
      expect(tx?.type).toBe('credit_purchase');
    });

    it('should fail verification if payment failed', async () => {
      const initRes = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'starter' });

      const ref = initRes.body.reference;
      const failRef = `${ref}_fail`;

      await CreditTransaction.updateOne(
        { paymentIntentId: ref },
        { paymentIntentId: failRef }
      );

      const verifyRes = await request(app)
        .get(`/api/v1/adult/wallet/paystack/verify/${failRef}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(verifyRes.body.success).toBe(false);

      const user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(0);
    });
  });

  describe('Idempotency & Webhooks', () => {
    it('should handle duplicate webhook calls without crediting wallet twice', async () => {
      const initRes = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'premium' }); // 100 diamonds (10,000 NGN)

      const ref = initRes.body.reference;
      const payload = {
        event: 'charge.success',
        data: {
          reference: ref,
          amount: 1000000, // 10,000 NGN in kobo
          currency: 'NGN',
          status: 'success',
        },
      };

      const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_paystack_secret_key';
      const signature = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // First Webhook call
      const webhook1 = await request(app)
        .post('/api/v1/adult/wallet/paystack/webhook')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(webhook1.status).toBe(200);

      let user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(100);

      // Second Webhook call (duplicate)
      const webhook2 = await request(app)
        .post('/api/v1/adult/wallet/paystack/webhook')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(webhook2.status).toBe(200);

      user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(100); // Balance should remain 100!
    });

    it('should handle callback + webhook race condition safely', async () => {
      const initRes = await request(app)
        .post('/api/v1/adult/wallet/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ package: 'elite' }); // 500 diamonds (50,000 NGN)

      const ref = initRes.body.reference;

      // Webhook arrives first
      const payload = {
        event: 'charge.success',
        data: {
          reference: ref,
          amount: 5000000,
          currency: 'NGN',
          status: 'success',
        },
      };
      const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_paystack_secret_key';
      const signature = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      await request(app)
        .post('/api/v1/adult/wallet/paystack/webhook')
        .set('x-paystack-signature', signature)
        .send(payload);

      let user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(500);

      // Callback executes after webhook
      const verifyRes = await request(app)
        .get(`/api/v1/adult/wallet/paystack/verify/${ref}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe('completed');

      user = await AdultUser.findById(userId);
      expect(user?.credits).toBe(500); // Still 500, not 1000!
    });
  });
});

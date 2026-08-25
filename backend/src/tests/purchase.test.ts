import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import jwt from 'jsonwebtoken';

describe('Wallet & Credit Purchase Integration Tests', () => {
  let replSet: MongoMemoryReplSet;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_mock_paystack_secret_key';
    process.env.ADULT_JWT_SECRET = 'adult_secret';

    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const mongoUri = replSet.getUri();
    await mongoose.connect(mongoUri);

    const user = new AdultUser({
      email: 'buyer@wallet.com',
      passwordHash: 'password123',
      username: 'buyeruser',
      displayName: 'Loyal Buyer',
      dateOfBirth: new Date('1990-01-01'),
      role: 'user',
      country: 'USA',
      credits: 50, // Initial balance
    });
    await user.save();
    userId = user._id.toString();

    userToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  });

  it('GET /api/v1/adult/wallet/bundles returns 4 credit bundles', async () => {
    const res = await request(app)
      .get('/api/v1/adult/wallet/bundles')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);

    const popularBundle = res.body.find((b: any) => b.id === 'popular');
    expect(popularBundle).toBeDefined();
    expect(popularBundle.credits).toBe(20);
    expect(popularBundle.priceNaira).toBe(2000);
    expect(popularBundle.badge).toBe('Most Popular');
  });

  it('POST /api/v1/adult/wallet/paystack/initialize creates pending transaction and returns Paystack initialization details', async () => {
    const res = await request(app)
      .post('/api/v1/adult/wallet/paystack/initialize')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ package: 'popular' })
      .expect(200);

    expect(res.body.authorizationUrl).toBeDefined();
    expect(res.body.reference).toBeDefined();

    const pendingTx = await CreditTransaction.findOne({ paymentIntentId: res.body.reference });
    expect(pendingTx).toBeDefined();
    expect(pendingTx?.status).toBe('pending');
    expect(pendingTx?.amount).toBe(20);
  });

  it('GET /api/v1/adult/wallet/paystack/verify/:reference completes transaction and updates wallet balance', async () => {
    const initRes = await request(app)
      .post('/api/v1/adult/wallet/paystack/initialize')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ package: 'popular' })
      .expect(200);

    const reference = initRes.body.reference;

    const verifyRes = await request(app)
      .get(`/api/v1/adult/wallet/paystack/verify/${reference}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.status).toBe('completed');

    // Fetch updated wallet balance
    const walletRes = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    // Initial 50 + 20 = 70
    expect(walletRes.body.creditBalance).toBe(70);
    expect(walletRes.body.lifetimeCreditsPurchased).toBe(20);
  });

  it('GET /api/v1/adult/wallet/transactions returns paginated history list', async () => {
    const res = await request(app)
      .get('/api/v1/adult/wallet/transactions?page=1&limit=5')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.transactions).toBeDefined();
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('GET /api/v1/adult/subscriptions/plans returns subscription plans list from config/database', async () => {
    const res = await request(app)
      .get('/api/v1/adult/subscriptions/plans')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].features).toBeDefined();
    expect(res.body[0].priceMonthly).toBeDefined();
  });
});

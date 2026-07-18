import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import jwt from 'jsonwebtoken';

describe('Wallet & Credit Purchase Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
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
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('GET /api/v1/adult/wallet/bundles returns 4 credit bundles', async () => {
    const res = await request(app)
      .get('/api/v1/adult/wallet/bundles')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);

    const bundle500 = res.body.find((b: any) => b.id === 'bundle_500');
    expect(bundle500).toBeDefined();
    expect(bundle500.credits).toBe(500);
    expect(bundle500.priceUsd).toBe(19.99);
    expect(bundle500.badge).toBe('Best Value');
  });

  it('POST /api/v1/adult/wallet/purchase/intent creates pending transaction and returns simulated Stripe intent details', async () => {
    const res = await request(app)
      .post('/api/v1/adult/wallet/purchase/intent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bundleId: 'bundle_500' })
      .expect(200);

    expect(res.body.clientSecret).toBeDefined();
    expect(res.body.paymentIntentId).toBeDefined();

    const pendingTx = await CreditTransaction.findOne({ paymentIntentId: res.body.paymentIntentId });
    expect(pendingTx).toBeDefined();
    expect(pendingTx?.status).toBe('pending');
    expect(pendingTx?.amount).toBe(500);
  });

  it('POST /api/v1/adult/wallet/purchase/webhook successfully completes transaction and updates wallet balance', async () => {
    const intentRes = await request(app)
      .post('/api/v1/adult/wallet/purchase/intent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bundleId: 'bundle_1500' })
      .expect(200);

    const paymentIntentId = intentRes.body.paymentIntentId;

    const webhookRes = await request(app)
      .post('/api/v1/adult/wallet/purchase/webhook')
      .send({ paymentIntentId })
      .expect(200);

    expect(webhookRes.body.success).toBe(true);
    expect(webhookRes.body.transaction.status).toBe('completed');

    // Fetch updated wallet balance
    const walletRes = await request(app)
      .get('/api/v1/adult/wallet')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    // Initial 50 + 1500 = 1550
    expect(walletRes.body.creditBalance).toBe(1550);
    expect(walletRes.body.lifetimeCreditsPurchased).toBe(1500);
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

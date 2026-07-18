import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import jwt from 'jsonwebtoken';

describe('Provider Earnings & Payout API', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;
  let memberId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

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
          details: { routingNumber: '123456789', accountNumber: '987654321' }
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
    // 15000 * 0.0075 = 112.50
    expect(res.body.data.pending).toBe(112.50);
    expect(res.body.data.timeline).toHaveLength(6);
    expect(res.body.data.transactions).toHaveLength(0);
  });

  it('POST /api/v1/adult/providers/me/payout processes payout successfully and creates CreditTransaction', async () => {
    // We have 15000 pending credits ($112.50 USD), which is over the $50 threshold.
    // Provider wallet balance starts at 20000 credits.
    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.newBalance).toBe(5000); // 20000 - 15000

    // Check that payout transaction was created
    const tx = await CreditTransaction.findOne({ userId: providerId, type: 'payout' });
    expect(tx).toBeDefined();
    expect(tx!.amount).toBe(-15000);
    expect(tx!.status).toBe('completed');
  });

  it('GET /api/v1/adult/providers/me/earnings reflects paid out and pending changes', async () => {
    const res = await request(app)
      .get('/api/v1/adult/providers/me/earnings')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalEarned).toBe(15000);
    expect(res.body.data.paidOut).toBe(112.50);
    expect(res.body.data.pending).toBe(0);
    expect(res.body.data.transactions).toHaveLength(1);
    expect(res.body.data.transactions[0].type).toBe('Payout');
    expect(res.body.data.transactions[0].from).toBe('Bank Transfer');
    expect(res.body.data.transactions[0].amount).toBe(-15000);
    expect(res.body.data.transactions[0].usd).toBe(-112.50);
  });

  it('POST /api/v1/adult/providers/me/payout fails if pending payout is below threshold', async () => {
    // Current pending balance is 0 credits ($0.00)
    const res = await request(app)
      .post('/api/v1/adult/providers/me/payout')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Minimum payout threshold');
  });
});

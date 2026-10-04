import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app';
import AdultUser from '../models/AdultUser';
import Party from '../models/Party';
import TicketOrder from '../models/TicketOrder';
import PartyPayoutRequest from '../models/PartyPayoutRequest';
import { invalidatePartyPayoutForOrder } from '../services/partyPayoutAccounting.service';

describe('Party host payout accounting', () => {
  let mongoServer: MongoMemoryReplSet;
  let organizerId: string;
  let adminId: string;
  let organizerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: '7.0.14' },
    });

    await mongoose.connect(mongoServer.getUri());

    // Transactions can race Mongoose's automatic index creation in the
    // in-memory replica set. Build the indexes used by the payout writes
    // before any test data or transactions are created.
    await Promise.all([
      AdultUser.init(),
      Party.init(),
      TicketOrder.init(),
      PartyPayoutRequest.init(),
    ]);

    organizerId = new mongoose.Types.ObjectId().toString();
    adminId = new mongoose.Types.ObjectId().toString();

    await AdultUser.create([
      {
        _id: organizerId,
        email: 'host@example.com',
        username: 'host',
        displayName: 'Host',
        country: 'NG',
        dateOfBirth: new Date('1995-01-01'),
        passwordHash: 'hashedpass',
        role: 'user',
      },
      {
        _id: adminId,
        email: 'admin@example.com',
        username: 'admin',
        displayName: 'Admin',
        country: 'NG',
        dateOfBirth: new Date('1990-01-01'),
        passwordHash: 'hashedpass',
        role: 'admin',
        isAdmin: true,
      },
    ]);

    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    organizerToken = jwt.sign({ _id: organizerId, sub: organizerId, role: 'user' }, secret);
    adminToken = jwt.sign({ _id: adminId, sub: adminId, role: 'admin', isAdmin: true }, secret);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await PartyPayoutRequest.deleteMany({});
    await TicketOrder.deleteMany({});
    await Party.deleteMany({});
  });

  const createEndedPartyAndOrder = async (organizerNaira = 12_000) => {
    const party = await Party.create({
      title: 'Host Payout Test',
      description: 'Party payout accounting regression test',
      venueName: 'Test Venue',
      venueAddress: 'Lagos',
      startDate: new Date(Date.now() - 86_400_000 * 2),
      endDate: new Date(Date.now() - 86_400_000),
      coverImage: 'https://example.com/party.jpg',
      organizerId: new mongoose.Types.ObjectId(organizerId),
      status: 'approved',
      ticketTiers: [
        {
          tierId: 'general',
          name: 'General',
          price: organizerNaira + 1_000,
          quantity: 100,
          sold: 1,
          perPersonLimit: 4,
          isActive: true,
        },
      ],
    });

    const order = await TicketOrder.create({
      orderReference: `ZPP-ORD-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      partyId: party._id,
      tierId: 'general',
      buyerId: new mongoose.Types.ObjectId(),
      buyerName: 'Buyer',
      quantity: 1,
      priceNaira: organizerNaira + 1_000,
      platformFeeNaira: 1_000,
      organizerNaira,
      paymentProvider: 'wallet',
      paymentReference: `ref-${new mongoose.Types.ObjectId().toString()}`,
      status: 'fulfilled',
    });

    return { party, order };
  };

  const requestPayout = async () =>
    request(app)
      .post('/api/v1/parties/hosted/payout')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        bankName: 'GTBank',
        accountHolder: 'Host',
        accountNumber: '0123456789',
      });

  it('rejects an active payout and releases all claims when a claimed order is refunded', async () => {
    const { order } = await createEndedPartyAndOrder();

    const payoutRes = await requestPayout();
    expect(payoutRes.status).toBe(201);

    const payout = await PartyPayoutRequest.findOne({ organizerId });
    expect(payout?.status).toBe('requested');

    await invalidatePartyPayoutForOrder(
      order._id,
      'A ticket refund invalidated an active party payout. The host must submit a new payout request.'
    );

    const [updatedPayout, updatedOrder] = await Promise.all([
      PartyPayoutRequest.findById(payout?._id).lean(),
      TicketOrder.findById(order._id).lean(),
    ]);

    expect(updatedPayout?.status).toBe('rejected');
    expect(updatedPayout?.isActive).toBe(false);
    expect(updatedOrder?.partyPayoutId).toBeUndefined();
  });

  it('does not pay a stale processing payout whose claimed order is no longer fulfilled', async () => {
    const { order } = await createEndedPartyAndOrder();

    const payoutRes = await requestPayout();
    expect(payoutRes.status).toBe(201);

    const payoutId = payoutRes.body.payout._id;

    const verifyRes = await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyRes.status).toBe(200);

    const processRes = await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/process`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(processRes.status).toBe(200);

    await TicketOrder.updateOne(
      { _id: order._id },
      { $set: { status: 'refunded' } }
    );

    const completeRes = await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reference: 'bank-ref-123' });

    expect(completeRes.status).toBe(409);

    const payout = await PartyPayoutRequest.findById(payoutId).lean();
    expect(payout?.status).toBe('processing');
    expect(payout?.isActive).toBe(true);
  });

  it('allows an admin to fail a processing payout and release the claimed earnings', async () => {
    const { order } = await createEndedPartyAndOrder();

    const payoutRes = await requestPayout();
    expect(payoutRes.status).toBe(201);

    const payoutId = payoutRes.body.payout._id;

    await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/process`)
      .set('Authorization', `Bearer ${adminToken}`);

    const failRes = await request(app)
      .put(`/api/admin/party-payouts/${payoutId}/fail`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Bank transfer failed' });

    expect(failRes.status).toBe(200);

    const [payout, updatedOrder] = await Promise.all([
      PartyPayoutRequest.findById(payoutId).lean(),
      TicketOrder.findById(order._id).lean(),
    ]);

    expect(payout?.status).toBe('failed');
    expect(payout?.isActive).toBe(false);
    expect(payout?.failedBy?.toString()).toBe(adminId);
    expect(updatedOrder?.partyPayoutId).toBeUndefined();
  });

  it('supports a repeat payout after a previous payout is paid', async () => {
    const first = await createEndedPartyAndOrder();

    const firstPayoutRes = await requestPayout();
    expect(firstPayoutRes.status).toBe(201);
    const firstPayoutId = firstPayoutRes.body.payout._id;

    await request(app)
      .put(`/api/admin/party-payouts/${firstPayoutId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .put(`/api/admin/party-payouts/${firstPayoutId}/process`)
      .set('Authorization', `Bearer ${adminToken}`);

    const paidRes = await request(app)
      .put(`/api/admin/party-payouts/${firstPayoutId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reference: 'bank-ref-paid-1' });

    expect(paidRes.status).toBe(200);

    const paid = await PartyPayoutRequest.findById(firstPayoutId).lean();
    expect(paid?.status).toBe('paid');
    expect(paid?.processedBy?.toString()).toBe(adminId);

    const laterOrder = await TicketOrder.create({
      orderReference: `ZPP-ORD-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      partyId: first.party._id,
      tierId: 'general',
      buyerId: new mongoose.Types.ObjectId(),
      buyerName: 'Later Buyer',
      quantity: 1,
      priceNaira: 13_000,
      platformFeeNaira: 1_000,
      organizerNaira: 12_000,
      paymentProvider: 'wallet',
      paymentReference: `ref-${new mongoose.Types.ObjectId().toString()}`,
      status: 'fulfilled',
    });

    const secondPayoutRes = await requestPayout();
    expect(secondPayoutRes.status).toBe(201);
    expect(secondPayoutRes.body.payout._id).not.toBe(firstPayoutId);

    const second = await PartyPayoutRequest.findById(secondPayoutRes.body.payout._id).lean();
    expect(second?.ticketOrderIds.map(String)).toEqual([laterOrder._id.toString()]);
    expect(second?.amountNaira).toBe(12_000);
  });
});

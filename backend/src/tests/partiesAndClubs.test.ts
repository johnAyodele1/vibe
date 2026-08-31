import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../app';
import Club from '../models/Club';
import Party from '../models/Party';
import Ticket from '../models/Ticket';
import TicketOrder from '../models/TicketOrder';
import PlatformEarning from '../models/PlatformEarning';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

describe('Parties & Clubs Feature Concurrency & Security Test Suite', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let adminToken: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    userId = new mongoose.Types.ObjectId().toString();
    adminId = new mongoose.Types.ObjectId().toString();

    await AdultUser.create({
      _id: userId,
      email: 'user@example.com',
      username: 'testuser',
      displayName: 'Test User',
      country: 'NG',
      dateOfBirth: new Date('1995-01-01'),
      passwordHash: 'hashedpass',
      role: 'user',
      credits: 500, // 500 diamonds
    });

    await AdultUser.create({
      _id: adminId,
      email: 'admin@example.com',
      username: 'adminuser',
      displayName: 'Admin User',
      country: 'NG',
      dateOfBirth: new Date('1990-01-01'),
      passwordHash: 'hashedpass',
      role: 'admin',
      isAdmin: true,
    });

    const adultSecret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    userToken = jwt.sign({ _id: userId, sub: userId, displayName: 'Test User', role: 'user' }, adultSecret);
    adminToken = jwt.sign({ _id: adminId, sub: adminId, displayName: 'Admin User', role: 'admin', isAdmin: true }, adultSecret);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Club.deleteMany({});
    await Party.deleteMany({});
    await Ticket.deleteMany({});
    await TicketOrder.deleteMany({});
    await PlatformEarning.deleteMany({});
  });

  describe('Clubs', () => {
    it('POST /api/v1/clubs creates club in pending status', async () => {
      const res = await request(app)
        .post('/api/v1/clubs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Vibe Nightclub',
          description: 'Premier nightclub in V.I.',
          location: { city: 'Lagos', country: { name: 'Nigeria', code: 'NG' } },
          operatingHours: [{ day: new Date().getDay(), isOpen: true, openTime: '22:00', closeTime: '04:00' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.club.status).toBe('pending');
      expect(res.body.club.slug).toBe('vibe-nightclub');
    });

    it('Pending club is NOT visible in public GET /api/v1/clubs listing', async () => {
      await Club.create({
        name: 'Hidden Club',
        slug: 'hidden-club',
        status: 'pending',
      });

      const res = await request(app).get('/api/v1/clubs');
      expect(res.status).toBe(200);
      expect(res.body.clubs).toHaveLength(0);
    });

    it('Club IS visible after admin approves', async () => {
      const club = await Club.create({
        name: 'Approved Club',
        slug: 'approved-club',
        status: 'pending',
      });

      const approveRes = await request(app)
        .put(`/api/admin/clubs/${club._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.club.status).toBe('active');

      const publicRes = await request(app).get('/api/v1/clubs');
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.clubs).toHaveLength(1);
    });

    it('Unapproved club is NOT accessible via public detail endpoint by third party', async () => {
      const club = await Club.create({
        name: 'Secret Club',
        slug: 'secret-club',
        status: 'pending',
        ownerId: new mongoose.Types.ObjectId(),
      });

      const res = await request(app).get(`/api/v1/clubs/${club._id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Parties', () => {
    it('POST /api/v1/parties creates party in pending_review status', async () => {
      const start = new Date(Date.now() + 86400000);
      const end = new Date(Date.now() + 172800000);

      const res = await request(app)
        .post('/api/v1/parties')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Beach Party 2026',
          description: 'Fun in the sun description at least 10 chars',
          venueName: 'Elegushi Beach',
          venueAddress: 'Ikate, Lagos',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          coverImage: 'https://example.com/cover.jpg',
          guardAccessCode: '654321',
          ticketTiers: [
            { name: 'Regular', price: 5000, quantity: 50, perPersonLimit: 4 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.party.status).toBe('pending_review');
      expect(res.body.guardPin).toBe('654321');
    });

    it('Unapproved party is NOT accessible via public detail endpoint by third party', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Unapproved Rave',
        description: 'Private event',
        venueName: 'Landmark',
        venueAddress: 'VI Lagos',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/rave.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'pending_review',
        ticketTiers: [{ tierId: 't1', name: 'VIP', price: 10000, quantity: 20, sold: 0, perPersonLimit: 2, isActive: true }],
      });

      const res = await request(app).get(`/api/v1/parties/${party._id}`);
      expect(res.status).toBe(404);
    });

    it('adminToggleFeatureParty restricts featuring to approved parties only', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Draft Party',
        description: 'Draft event',
        venueName: 'Venue',
        venueAddress: 'Address',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/draft.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'pending_review',
        ticketTiers: [],
      });

      const res = await request(app)
        .put(`/api/admin/parties/${party._id}/feature`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('approved status');
    });
  });

  describe('Ticketing & Order Fulfillment Pipeline', () => {
    it('creates server-authoritative order and fulfills atomically with wallet credits', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Afrobeats Fest',
        description: 'Live music event',
        venueName: 'Eko Hotel',
        venueAddress: 'VI',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/afro.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        ticketTiers: [
          { tierId: 'tier-regular', name: 'Regular', price: 200, quantity: 10, sold: 0, perPersonLimit: 4, isActive: true },
        ],
      });

      const buyRes = await request(app)
        .post(`/api/v1/parties/${party._id}/tickets/orders`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          tierId: 'tier-regular',
          quantity: 2,
          paymentProvider: 'wallet',
        });

      expect(buyRes.status).toBe(201);
      expect(buyRes.body.success).toBe(true);
      expect(buyRes.body.tickets).toHaveLength(2);

      // Verify fee calculations: 2 * 200 = 400 total. 5% = 20 fee, 380 organizer
      expect(buyRes.body.summary.totalPaid).toBe(400);
      expect(buyRes.body.summary.platformFee).toBe(20);
      expect(buyRes.body.summary.organizerGets).toBe(380);

      // Verify idempotency protection: verifying same order returns existing tickets
      const order = await TicketOrder.findOne({ partyId: party._id });
      expect(order).not.toBeNull();

      const verifyRes = await request(app)
        .post(`/api/v1/parties/orders/${order?._id}/verify`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentReference: order?.paymentReference });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.tickets).toHaveLength(2);
    });

    it('restricts ticket detail lookup by code to the ticket owner', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Owned Party',
        description: 'Testing ticket ownership',
        venueName: 'Hall',
        venueAddress: 'Lagos',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/owned.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        ticketTiers: [{ tierId: 't1', name: 'Reg', price: 1000, quantity: 10, sold: 1, perPersonLimit: 4, isActive: true }],
      });

      const otherUserId = new mongoose.Types.ObjectId();
      const ticket = await Ticket.create({
        partyId: party._id,
        tierId: 't1',
        tierName: 'Reg',
        buyerId: otherUserId, // Owned by another user
        buyerName: 'Other Person',
        ticketCode: 'ZPP-OTHER1',
        priceNaira: 1000,
        platformFeeNaira: 50,
        organizerNaira: 950,
        paymentStatus: 'paid',
        entryStatus: 'not_entered',
        isValid: true,
      });

      const res = await request(app)
        .get(`/api/v1/me/tickets/${ticket.ticketCode}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Anti-Scam Check-in System & Guard Security', () => {
    it('scans ticket with valid Guard PIN and enforces atomic state transitions', async () => {
      const pin = '123456';
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Club Night',
        description: 'Dance all night',
        venueName: 'Hard Rock',
        venueAddress: 'VI',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/club.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        guardAccessCodeHash: pinHash,
        ticketTiers: [{ tierId: 't1', name: 'Reg', price: 2000, quantity: 10, sold: 1, perPersonLimit: 4, isActive: true }],
      });

      const ticket = await Ticket.create({
        partyId: party._id,
        tierId: 't1',
        tierName: 'Reg',
        buyerId: new mongoose.Types.ObjectId(userId),
        buyerName: 'John Doe',
        ticketCode: 'ZPP-TEST01',
        priceNaira: 2000,
        platformFeeNaira: 100,
        organizerNaira: 1900,
        paymentStatus: 'paid',
        entryStatus: 'not_entered',
        isValid: true,
      });

      // 1. Enter (not_entered -> entered)
      const enterRes = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });

      expect(enterRes.status).toBe(200);
      expect(enterRes.body.display).toBe('✅ Admitted');
      expect(enterRes.body.entryStatus).toBe('inside');

      // 2. Double enter attempt (inside -> entered) -> 409 Conflict
      const doubleEnterRes = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });

      expect(doubleEnterRes.status).toBe(409);
      expect(doubleEnterRes.body.display).toContain('already inside');
    });

    it('locks out guard PIN authentication after 5 consecutive failed attempts', async () => {
      const pin = '654321';
      const party = await Party.create({
        title: 'Secure VIP Event',
        description: 'Testing PIN brute-force lockout',
        venueName: 'Lounge',
        venueAddress: 'Abuja',
        startDate: new Date(),
        endDate: new Date(),
        coverImage: 'https://example.com/vip.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        guardAccessCodeHash: crypto.createHash('sha256').update(pin).digest('hex'),
        ticketTiers: [],
      });

      // Fail 5 times with wrong PIN
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/v1/parties/${party._id}/checkin/scan`)
          .set('X-Guard-Code', '000000')
          .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });
      }

      // 6th attempt (even with CORRECT PIN) -> 429 Locked out
      const res = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Locked out for 15 minutes');
    });
  });
});

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../app';
import Club from '../models/Club';
import Party from '../models/Party';
import Ticket from '../models/Ticket';
import PlatformEarning from '../models/PlatformEarning';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

describe('Parties & Clubs Feature Test Suite', () => {
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

    it('GET /api/v1/clubs?openToday=true filters by Africa/Lagos timezone operating hours', async () => {
      const todayDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })).getDay();

      await Club.create({
        name: 'Open Lounge',
        slug: 'open-lounge',
        status: 'active',
        operatingHours: [{ day: todayDay, isOpen: true }],
      });

      await Club.create({
        name: 'Closed Lounge',
        slug: 'closed-lounge',
        status: 'active',
        operatingHours: [{ day: todayDay, isOpen: false }],
      });

      const res = await request(app).get('/api/v1/clubs?openToday=true');
      expect(res.status).toBe(200);
      expect(res.body.clubs).toHaveLength(1);
      expect(res.body.clubs[0].name).toBe('Open Lounge');
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
          description: 'Fun in the sun',
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

    it('Party IS visible in public GET /api/v1/parties after admin approves', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Lagos Rave',
        description: 'Epic party',
        venueName: 'Landmark Beach',
        venueAddress: 'VI Lagos',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/rave.jpg',
        organizerId: new mongoose.Types.ObjectId(userId),
        status: 'pending_review',
        ticketTiers: [{ tierId: 't1', name: 'VIP', price: 10000, quantity: 20, sold: 0, perPersonLimit: 2, isActive: true }],
      });

      const approveRes = await request(app)
        .put(`/api/admin/parties/${party._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);

      const publicRes = await request(app).get('/api/v1/parties');
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.parties).toHaveLength(1);
    });
  });

  describe('Ticketing & Purchase Flow', () => {
    it('purchase tickets generates unique ZPP-XXXXXX codes and records 5% platform fee', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Afrobeats Fest',
        description: 'Live music',
        venueName: 'Eko Hotel',
        venueAddress: 'VI',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/afro.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        ticketTiers: [
          { tierId: 'tier-regular', name: 'Regular', price: 5000, quantity: 10, sold: 0, perPersonLimit: 4, isActive: true },
        ],
      });

      const buyRes = await request(app)
        .post(`/api/v1/parties/${party._id}/tickets/purchase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          tierId: 'tier-regular',
          quantity: 2,
        });

      expect(buyRes.status).toBe(201);
      expect(buyRes.body.success).toBe(true);
      expect(buyRes.body.tickets).toHaveLength(2);

      const ticket1 = buyRes.body.tickets[0];
      expect(ticket1.ticketCode).toMatch(/^ZPP-[A-Z2-9]{6}$/);

      // Verify fee calculations: 2 * 5000 = 10000 total. 5% = 500 fee, 9500 organizer
      expect(buyRes.body.summary.totalPaid).toBe(10000);
      expect(buyRes.body.summary.platformFee).toBe(500);
      expect(buyRes.body.summary.organizerGets).toBe(9500);

      // Check atomic update on Party tier sold count
      const updatedParty = await Party.findById(party._id);
      expect(updatedParty?.ticketTiers[0].sold).toBe(2);

      // Check PlatformEarning creation
      const earning = await PlatformEarning.findOne({ source: 'ticket_sale' });
      expect(earning).not.toBeNull();
      expect(earning?.amount).toBe(500);
    });

    it('enforces per-person limit across purchases', async () => {
      const start = new Date(Date.now() + 86400000);
      const party = await Party.create({
        title: 'Limited Party',
        description: 'Strict limit',
        venueName: 'Private Villa',
        venueAddress: 'Lekki',
        startDate: start,
        endDate: new Date(start.getTime() + 36000000),
        coverImage: 'https://example.com/limited.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        ticketTiers: [
          { tierId: 'tier-vip', name: 'VIP', price: 10000, quantity: 10, sold: 0, perPersonLimit: 2, isActive: true },
        ],
      });

      // Buy 2 (limit reached)
      await request(app)
        .post(`/api/v1/parties/${party._id}/tickets/purchase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tierId: 'tier-vip', quantity: 2 });

      // Attempt to buy 1 more -> 409 Conflict
      const failRes = await request(app)
        .post(`/api/v1/parties/${party._id}/tickets/purchase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tierId: 'tier-vip', quantity: 1 });

      expect(failRes.status).toBe(409);
      expect(failRes.body.error).toContain('Maximum 2 tickets per person');
    });
  });

  describe('Anti-Scam Check-in System', () => {
    it('scans ticket with valid Guard PIN and enforces strict entry transitions', async () => {
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
      expect(enterRes.body.entryCount).toBe(1);

      // 2. Double enter attempt (inside -> entered) -> 409 Conflict
      const doubleEnterRes = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });

      expect(doubleEnterRes.status).toBe(409);
      expect(doubleEnterRes.body.display).toContain('already inside');

      // 3. Exit (inside -> exited)
      const exitRes = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 'exited' });

      expect(exitRes.status).toBe(200);
      expect(exitRes.body.display).toBe('👋 Checked Out');
      expect(exitRes.body.entryStatus).toBe('outside');

      // 4. Re-enter (outside -> re_entered)
      const reEnterRes = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', pin)
        .send({ ticketCode: 'ZPP-TEST01', action: 're_entered' });

      expect(reEnterRes.status).toBe(200);
      expect(reEnterRes.body.display).toBe('🔄 Re-admitted');
      expect(reEnterRes.body.entryStatus).toBe('inside');
      expect(reEnterRes.body.entryCount).toBe(2);
    });

    it('rejects check-in with invalid Guard PIN', async () => {
      const party = await Party.create({
        title: 'VIP Party',
        description: 'Exclusive',
        venueName: 'Lounge',
        venueAddress: 'Abuja',
        startDate: new Date(),
        endDate: new Date(),
        coverImage: 'https://example.com/vip.jpg',
        organizerId: new mongoose.Types.ObjectId(),
        status: 'approved',
        guardAccessCodeHash: crypto.createHash('sha256').update('111111').digest('hex'),
        ticketTiers: [],
      });

      const res = await request(app)
        .post(`/api/v1/parties/${party._id}/checkin/scan`)
        .set('X-Guard-Code', '999999') // Wrong PIN
        .send({ ticketCode: 'ZPP-TEST01', action: 'entered' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Invalid guard code');
    });
  });
});

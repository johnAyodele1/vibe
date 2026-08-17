import { describe, expect, it, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import jwt from 'jsonwebtoken';

import app from '../app';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import CreditTransaction from '../models/CreditTransaction';
import { setupAdultSocket } from '../socket/adultSocket';

describe('Cam Session Analytics & Spectator Counts Test Suite', () => {
  let mongoServer: MongoMemoryReplSet;
  let httpServer: any;
  let ioServer: Server;
  let serverPort: number;

  let providerUser: any;
  let memberUser1: any;
  let memberUser2: any;
  let providerToken: string;
  let member1Token: string;
  let member2Token: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });
    const mongoUri = mongoServer.getUri();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoUri);

    httpServer = createServer(app);
    ioServer = new Server(httpServer);

    setupAdultSocket(ioServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        serverPort = typeof addr === 'string' ? 0 : addr.port;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    if (ioServer) {
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await CamSession.deleteMany({});
    await CreditTransaction.deleteMany({});

    providerUser = await AdultUser.create({
      username: 'provider_test',
      email: 'provider@test.com',
      passwordHash: 'hashedpassword',
      displayName: 'Goddess Provider',
      dateOfBirth: new Date(1995, 1, 1),
      country: 'United Kingdom',
      role: 'provider',
      isActive: true,
      credits: 1000,
      providerProfile: {
        stageName: 'Goddess Provider',
        totalEarnings: 0,
        onboarding: { isComplete: true }
      }
    });

    memberUser1 = await AdultUser.create({
      username: 'member_one',
      email: 'member1@test.com',
      passwordHash: 'hashedpassword',
      displayName: 'Member One',
      dateOfBirth: new Date(1995, 1, 1),
      country: 'United Kingdom',
      role: 'user',
      isActive: true,
      credits: 1000
    });

    memberUser2 = await AdultUser.create({
      username: 'member_two',
      email: 'member2@test.com',
      passwordHash: 'hashedpassword',
      displayName: 'Member Two',
      dateOfBirth: new Date(1995, 1, 1),
      country: 'United Kingdom',
      role: 'user',
      isActive: true,
      credits: 1000
    });

    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    providerToken = jwt.sign({ sub: providerUser._id.toString() }, secret);
    member1Token = jwt.sign({ sub: memberUser1._id.toString() }, secret);
    member2Token = jwt.sign({ sub: memberUser2._id.toString() }, secret);
  });

  const waitForEvent = (socket: any, eventName: string, timeoutMs = 5000) => {
    return new Promise<any>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      socket.once(eventName, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  it('Real-time spectator counts update correctly, deduplicate sockets, and track peak viewers without decreasing', async () => {
    const camSession = await CamSession.create({
      providerId: providerUser._id,
      title: 'Analytics Test Session',
      sessionType: 'public',
      status: 'live',
      streamKey: `cam_${providerUser._id}_${Date.now()}`,
      streamPlaybackUrl: 'http://test.stream/play',
      startedAt: new Date(),
      peakViewerCount: 0
    });

    const socketUrl = `http://localhost:${serverPort}/adult`;

    // 1. Provider connects and joins cam room
    const providerSocket = ClientIO(socketUrl, { auth: { token: providerToken }, transports: ['websocket'], forceNew: true });
    await new Promise<void>(res => providerSocket.on('connect', () => res()));

    const provPromise = waitForEvent(providerSocket, 'cam:viewerCount');
    providerSocket.emit('cam:join', camSession._id.toString());
    await provPromise;

    // Provider joining should NOT count as a spectator (peak spectator count = 0)
    let freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.peakViewerCount).toBe(0);

    // 2. Member 1 connects Socket A and joins cam room
    const member1SocketA = ClientIO(socketUrl, { auth: { token: member1Token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>(res => member1SocketA.on('connect', () => res()));

    const countPromise1 = waitForEvent(member1SocketA, 'cam:viewerCount');
    member1SocketA.emit('cam:join', camSession._id.toString());
    const count1 = await countPromise1;
    expect(count1).toBe(1);

    // Spectator count is 1, peak becomes 1
    freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.peakViewerCount).toBe(1);

    // 3. Member 1 opens a SECOND tab/socket B (duplicate connection check)
    const member1SocketB = ClientIO(socketUrl, { auth: { token: member1Token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>(res => member1SocketB.on('connect', () => res()));

    const countPromise1B = waitForEvent(member1SocketB, 'cam:viewerCount');
    member1SocketB.emit('cam:join', camSession._id.toString());
    const count1B = await countPromise1B;
    expect(count1B).toBe(1);

    // Spectator count must STILL be 1! (deduplicated by user ID)
    freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.peakViewerCount).toBe(1);

    // 4. Member 2 connects and joins
    const member2Socket = ClientIO(socketUrl, { auth: { token: member2Token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>(res => member2Socket.on('connect', () => res()));

    const countPromise2 = waitForEvent(member2Socket, 'cam:viewerCount');
    member2Socket.emit('cam:join', camSession._id.toString());
    const count2 = await countPromise2;
    expect(count2).toBe(2);

    // Spectator count is 2, peak becomes 2
    freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.peakViewerCount).toBe(2);

    // 5. Member 2 leaves / disconnects
    const countPromiseLeave = waitForEvent(member1SocketA, 'cam:viewerCount');
    member2Socket.emit('cam:leave', camSession._id.toString());
    const countAfterLeave = await countPromiseLeave;
    expect(countAfterLeave).toBe(1);

    // Peak spectator count MUST remain 2 (never decreases!)
    freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.peakViewerCount).toBe(2);

    providerSocket.disconnect();
    member1SocketA.disconnect();
    member1SocketB.disconnect();
    member2Socket.disconnect();
  }, 20000);

  it('Session earnings associate properly with cam session and reflect accurately on provider dashboard', async () => {
    const camSession = await CamSession.create({
      providerId: providerUser._id,
      title: 'Earnings Test Cam Session',
      sessionType: 'public',
      status: 'live',
      streamKey: `cam_${providerUser._id}_${Date.now()}`,
      streamPlaybackUrl: 'http://test.stream/play',
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      endedAt: new Date(), // ended now
      peakViewerCount: 5,
      totalTipsReceived: 0
    });

    // Member 1 sends direct tip during stream
    const tipRes = await request(app)
      .post('/api/v1/adult/wallet/tip')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        recipientId: providerUser._id.toString(),
        amount: 200,
        message: 'Great stream!'
      });

    expect(tipRes.status).toBe(200);

    // Check that CamSession has accumulated tips
    let freshSession = await CamSession.findById(camSession._id);
    expect(freshSession?.totalTipsReceived).toBeGreaterThan(0);

    // Query Dashboard Endpoint
    const dashRes = await request(app)
      .get('/api/v1/adult/providers/me/dashboard')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.success).toBe(true);

    const recent = dashRes.body.data.recentSessions;
    expect(recent.length).toBeGreaterThan(0);

    const matchSession = recent[0];
    expect(matchSession.peakViewers).toBe(5);
    expect(matchSession.tips).toBe(170); // 85% of 200 diamonds = 170 diamonds provider earnings
  });
});

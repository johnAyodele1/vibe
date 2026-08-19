import { describe, expect, it, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import jwt from 'jsonwebtoken';

import app from '../app';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import CreditTransaction from '../models/CreditTransaction';
import SpinWheel from '../models/SpinWheel';
import { setupAdultSocket, updateCamSpectatorCount } from '../socket/adultSocket';

describe('Cam Session Analytics & Spectator Counts Complete Verification Suite', () => {
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
    await SpinWheel.deleteMany({});

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

  describe('Spectator Count Cases (E, F, G, H)', () => {
    it('E & F & G & H: Spectator counting rules (unique viewers, provider excluded, disconnect cleanup, peak non-decreasing)', async () => {
      const camSession = await CamSession.create({
        providerId: providerUser._id,
        title: 'Spectator Invariants Stream',
        sessionType: 'public',
        status: 'live',
        streamKey: `cam_${providerUser._id}_${Date.now()}`,
        streamPlaybackUrl: 'http://test.stream/play',
        startedAt: new Date(),
        peakViewerCount: 0
      });

      const socketUrl = `http://localhost:${serverPort}/adult`;

      // F. Provider's own socket is connected & joined
      const providerSocket = ClientIO(socketUrl, { auth: { token: providerToken }, transports: ['websocket'], forceNew: true });
      await new Promise<void>(res => providerSocket.on('connect', () => res()));
      providerSocket.emit('cam:join', camSession._id.toString());
      await new Promise(res => setTimeout(res, 150));

      // Provider joining MUST NOT count as a spectator (peak = 0)
      let freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.peakViewerCount).toBe(0);

      // E. Member 1 joins via socket 1
      const member1SocketA = ClientIO(socketUrl, { auth: { token: member1Token }, transports: ['websocket'], forceNew: true });
      await new Promise<void>(res => member1SocketA.on('connect', () => res()));

      const countPromise1 = waitForEvent(member1SocketA, 'cam:viewerCount');
      member1SocketA.emit('cam:join', camSession._id.toString());
      const count1 = await countPromise1;
      expect(count1).toBe(1);

      // E. Member 1 opens a SECOND socket tab (duplicate connection check)
      const member1SocketB = ClientIO(socketUrl, { auth: { token: member1Token }, transports: ['websocket'], forceNew: true });
      await new Promise<void>(res => member1SocketB.on('connect', () => res()));

      const countPromise1B = waitForEvent(member1SocketB, 'cam:viewerCount');
      member1SocketB.emit('cam:join', camSession._id.toString());
      const count1B = await countPromise1B;

      // Unique spectator count MUST STILL BE 1!
      expect(count1B).toBe(1);

      // Member 2 joins -> count becomes 2, peak becomes 2
      const member2Socket = ClientIO(socketUrl, { auth: { token: member2Token }, transports: ['websocket'], forceNew: true });
      await new Promise<void>(res => member2Socket.on('connect', () => res()));

      const countPromise2 = waitForEvent(member2Socket, 'cam:viewerCount');
      member2Socket.emit('cam:join', camSession._id.toString());
      const count2 = await countPromise2;
      expect(count2).toBe(2);

      freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.peakViewerCount).toBe(2);

      // G. Member 2 disconnects -> count decreases immediately, peak NEVER decreases
      const countPromiseLeave = waitForEvent(member1SocketA, 'cam:viewerCount');
      member2Socket.emit('cam:leave', camSession._id.toString());
      const countAfterLeave = await countPromiseLeave;
      expect(countAfterLeave).toBe(1);

      freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.peakViewerCount).toBe(2);

      // H. Concurrent update check: calling updateCamSpectatorCount with current count 1 cannot overwrite peak 2
      const adultNs = ioServer.of('/adult');
      await updateCamSpectatorCount(adultNs, camSession._id.toString());

      freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.peakViewerCount).toBe(2);

      providerSocket.disconnect();
      member1SocketA.disconnect();
      member1SocketB.disconnect();
      member2Socket.disconnect();
    }, 20000);
  });

  describe('Earnings Cases (A, B, C, D)', () => {
    it('A. Provider live + direct tip → tip is associated with current CamSession and earnings increase by provider NET amount (85%)', async () => {
      const camSession = await CamSession.create({
        providerId: providerUser._id,
        title: 'Direct Tip Stream',
        sessionType: 'public',
        status: 'live',
        streamKey: `cam_${providerUser._id}_${Date.now()}`,
        streamPlaybackUrl: 'http://test.stream/play',
        startedAt: new Date(),
        totalTipsReceived: 0
      });

      const tipRes = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({
          recipientId: providerUser._id.toString(),
          amount: 200,
          message: 'Tip during stream!'
        });

      expect(tipRes.status).toBe(200);

      // Provider NET amount: 200 * 0.85 = 170
      const freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.totalTipsReceived).toBe(170);

      // Check transaction metadata
      const tx = await CreditTransaction.findOne({ type: 'tip_received', userId: providerUser._id });
      expect(tx?.metadata?.camSessionId?.toString()).toBe(camSession._id.toString());
      expect(tx?.amount).toBe(170);
    });

    it('B. Provider live + wheel spin → wheel transaction is associated with current CamSession and earnings increase by provider NET amount (85%)', async () => {
      // Configure wheel
      await request(app)
        .put('/api/v1/adult/providers/me/wheel')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          isActive: true,
          items: [
            { id: '1', label: 'Item 1', creditCost: 100, probability: 1, color: '#f00' },
            { id: '2', label: 'Item 2', creditCost: 100, probability: 1, color: '#0f0' }
          ]
        });

      const camSession = await CamSession.create({
        providerId: providerUser._id,
        title: 'Wheel Spin Stream',
        sessionType: 'public',
        status: 'live',
        streamKey: `cam_${providerUser._id}_${Date.now()}`,
        streamPlaybackUrl: 'http://test.stream/play',
        startedAt: new Date(),
        totalTipsReceived: 0
      });

      const spinRes = await request(app)
        .post(`/api/v1/adult/providers/${providerUser._id}/wheel/spin`)
        .set('Authorization', `Bearer ${member1Token}`)
        .send({ camSessionId: camSession._id.toString() });

      expect(spinRes.status).toBe(200);

      // Provider NET amount: 100 * 0.85 = 85
      const freshSession = await CamSession.findById(camSession._id);
      expect(freshSession?.totalTipsReceived).toBe(85);

      // Check transaction metadata
      const tx = await CreditTransaction.findOne({ type: 'spin_wheel', userId: providerUser._id });
      expect(tx?.metadata?.camSessionId?.toString()).toBe(camSession._id.toString());
      expect(tx?.amount).toBe(85);
    });

    it('C. Provider not live + direct tip → no CamSession association', async () => {
      const tipRes = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({
          recipientId: providerUser._id.toString(),
          amount: 200,
          message: 'Offline tip!'
        });

      expect(tipRes.status).toBe(200);

      const tx = await CreditTransaction.findOne({ type: 'tip_received', userId: providerUser._id });
      expect(tx?.metadata?.camSessionId).toBeUndefined();
    });

    it('D. Session A ends → Session B starts → new tip belongs only to Session B', async () => {
      // Session A
      const sessionA = await CamSession.create({
        providerId: providerUser._id,
        title: 'Stream A',
        sessionType: 'public',
        status: 'ended',
        streamKey: `cam_${providerUser._id}_A`,
        streamPlaybackUrl: 'http://test.stream/playA',
        startedAt: new Date(Date.now() - 3600000),
        endedAt: new Date(Date.now() - 1800000),
        totalTipsReceived: 100
      });

      // Session B is live
      const sessionB = await CamSession.create({
        providerId: providerUser._id,
        title: 'Stream B',
        sessionType: 'public',
        status: 'live',
        streamKey: `cam_${providerUser._id}_B`,
        streamPlaybackUrl: 'http://test.stream/playB',
        startedAt: new Date(),
        totalTipsReceived: 0
      });

      const tipRes = await request(app)
        .post('/api/v1/adult/wallet/tip')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({
          recipientId: providerUser._id.toString(),
          amount: 200,
          message: 'Tip for Stream B!'
        });

      expect(tipRes.status).toBe(200);

      const freshSessionA = await CamSession.findById(sessionA._id);
      const freshSessionB = await CamSession.findById(sessionB._id);

      // Session A earnings remain unchanged at 100
      expect(freshSessionA?.totalTipsReceived).toBe(100);

      // Session B earnings increase by provider NET (170)
      expect(freshSessionB?.totalTipsReceived).toBe(170);

      const tx = await CreditTransaction.findOne({ type: 'tip_received', userId: providerUser._id });
      expect(tx?.metadata?.camSessionId?.toString()).toBe(sessionB._id.toString());
    });
  });
});

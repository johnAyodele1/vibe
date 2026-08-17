import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { setupAdultSocket } from '../socket/adultSocket';

describe('Cam Session Lifecycle Integration Tests (A - N)', () => {
  let mongoServer: MongoMemoryServer;
  let httpServer: any;
  let ioServer: SocketIOServer;
  let port: number;

  let providerToken: string;
  let providerId: string;

  let viewerToken: string;
  let viewerId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '6.0.14' }
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    httpServer = createServer(app);
    ioServer = new SocketIOServer(httpServer);
    setupAdultSocket(ioServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'string' ? 0 : addr?.port || 0;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    if (ioServer) {
      ioServer.close();
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await CamSession.deleteMany({});

    const provider = new AdultUser({
      email: 'provider@test.com',
      passwordHash: 'hashedpass',
      username: 'testprovider',
      displayName: 'Test Provider',
      role: 'provider',
      status: 'active',
      country: 'US',
      dateOfBirth: new Date(1995, 0, 1),
      isVerified: true,
      emailVerified: true,
      providerProfile: {
        stageName: 'Test Provider',
        onboarding: { isComplete: true },
        isOnline: true,
        isLive: false,
      },
    });
    await provider.save();
    providerId = provider._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    const viewer = new AdultUser({
      email: 'viewer@test.com',
      passwordHash: 'hashedpass',
      username: 'testviewer',
      displayName: 'Test Viewer',
      role: 'user',
      status: 'active',
      country: 'US',
      dateOfBirth: new Date(1998, 0, 1),
      emailVerified: true,
    });
    await viewer.save();
    viewerId = viewer._id.toString();
    viewerToken = jwt.sign({ sub: viewerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  const activeClients: ClientSocket[] = [];

  const createSocketClient = (token: string): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const client = ClientIO(`http://localhost:${port}/adult`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
      });
      activeClients.push(client);
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  };

  afterEach(() => {
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients.length = 0;
  });

  test('A. Start stream successfully -> status = pending then transitions to live via cam:host_start socket event', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'My Live Show' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const { sessionId } = res.body.data;

    let session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('pending');

    const providerSocket = await createSocketClient(providerToken);
    providerSocket.emit('cam:host_start', { sessionId });
    await new Promise((r) => setTimeout(r, 150));

    session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('live');

    const updatedProvider = await AdultUser.findById(providerId);
    expect(updatedProvider?.providerProfile?.isLive).toBe(true);

    providerSocket.disconnect();
  }, 10000);

  test('B. Start stream fails / startup crash -> pending session auto-cleaned, no orphan live session remains', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Crash Test Show' });

    expect(res.status).toBe(201);
    const { sessionId } = res.body.data;

    // Simulate startup failure/reload where provider never sent cam:host_start
    await new Promise((r) => setTimeout(r, 16000));

    // Next time provider queries active session, stale pending session is cleaned
    const checkRes = await request(app)
      .get('/api/adult/cams/my-active-session')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.data.activeSession).toBeNull();

    const oldSession = await CamSession.findById(sessionId);
    expect(oldSession?.status).toBe('ended');
  }, 20000);

  test('C. Second device tries to stream while live -> 409 Conflict ("You are already streaming on another device.")', async () => {
    const res1 = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Stream 1' });

    expect(res1.status).toBe(201);
    const { sessionId } = res1.body.data;

    const providerSocket = await createSocketClient(providerToken);
    await new Promise((resolve) => providerSocket.emit('cam:host_start', { sessionId }, (ack: any) => resolve(ack)));

    // Second start request from device 2
    const res2 = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Stream 2' });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('You are already streaming on another device.');

    providerSocket.disconnect();
  }, 10000);

  test('D. Broadcast connection disconnects & grace period expires -> stream becomes ended automatically', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Disconnect Test' });

    const { sessionId } = res.body.data;

    const providerSocket = await createSocketClient(providerToken);
    await new Promise((resolve) => providerSocket.emit('cam:host_start', { sessionId }, (ack: any) => resolve(ack)));

    let session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('live');

    // Host socket disconnects
    providerSocket.disconnect();

    // Wait for disconnect grace period to expire (200ms in test environment)
    await new Promise((r) => setTimeout(r, 400));

    session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('ended');

    const provider = await AdultUser.findById(providerId);
    expect(provider?.providerProfile?.isLive).toBe(false);
  }, 18000);

  test('E. Unrelated socket disconnects -> stream does NOT end if host broadcast socket remains connected', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Multi-Socket Test' });

    const { sessionId } = res.body.data;

    // Socket 1: Host broadcast socket
    const hostSocket = await createSocketClient(providerToken);
    hostSocket.emit('cam:host_start', { sessionId });
    await new Promise((r) => setTimeout(r, 100));

    // Socket 2: Unrelated socket (e.g. Chat or second browser tab)
    const extraSocket = await createSocketClient(providerToken);

    // Disconnect unrelated socket
    extraSocket.disconnect();
    await new Promise((r) => setTimeout(r, 400));

    const session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('live');

    hostSocket.disconnect();
  }, 20000);

  test('F. End Broadcast endpoint -> stream becomes ended atomically', async () => {
    const startRes = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Manual End Test' });

    const { sessionId } = startRes.body.data;

    const endRes = await request(app)
      .patch(`/api/adult/cams/stream/${sessionId}/end`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.success).toBe(true);

    const session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('ended');
  }, 10000);

  test('G. End Broadcast + socket disconnect simultaneously -> exactly one atomic end transition', async () => {
    const startRes = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Simultaneous End Test' });

    const { sessionId } = startRes.body.data;

    const hostSocket = await createSocketClient(providerToken);
    await new Promise((resolve) => hostSocket.emit('cam:host_start', { sessionId }, (ack: any) => resolve(ack)));

    // Trigger both simultaneously
    const endPromise = request(app)
      .patch(`/api/adult/cams/stream/${sessionId}/end`)
      .set('Authorization', `Bearer ${providerToken}`);

    hostSocket.disconnect();

    const [endRes] = await Promise.all([endPromise]);
    expect(endRes.status).toBe(200);

    const session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('ended');
  }, 10000);

  test('H. Temporary socket reconnect within grace period -> stream remains live', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Temporary Reconnect Test' });

    const { sessionId } = res.body.data;

    let socket1 = await createSocketClient(providerToken);
    socket1.emit('cam:host_start', { sessionId });
    await new Promise((r) => setTimeout(r, 100));

    // Disconnect socket 1
    socket1.disconnect();

    // Reconnect after 50ms (well within 200ms grace period)
    await new Promise((r) => setTimeout(r, 50));
    let socket2 = await createSocketClient(providerToken);
    socket2.emit('cam:host_start', { sessionId });
    await new Promise((r) => setTimeout(r, 100));

    // Wait past the original 200ms mark
    await new Promise((r) => setTimeout(r, 300));

    const session = await CamSession.findById(sessionId);
    expect(session?.status).toBe('live');

    socket2.disconnect();
  }, 20000);

  test('J. Ended stream can be replaced by a new stream seamlessly', async () => {
    const res1 = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Stream 1' });

    const { sessionId: s1 } = res1.body.data;

    await request(app)
      .patch(`/api/adult/cams/stream/${s1}/end`)
      .set('Authorization', `Bearer ${providerToken}`);

    const res2 = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Stream 2' });

    expect(res2.status).toBe(201);
    expect(res2.body.data.sessionId).not.toBe(s1);
  }, 10000);

  test('L. Viewer receives stream-ended event after host unexpected disconnect', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Viewer Event Test' });

    const { sessionId } = res.body.data;

    const hostSocket = await createSocketClient(providerToken);
    hostSocket.emit('cam:host_start', { sessionId });
    await new Promise((r) => setTimeout(r, 100));

    const viewerSocket = await createSocketClient(viewerToken);
    viewerSocket.emit('cam:join', sessionId);

    let streamEndedEventReceived = false;
    viewerSocket.on('cam:session_ended', (data) => {
      if (data.sessionId === sessionId) {
        streamEndedEventReceived = true;
      }
    });

    hostSocket.disconnect();

    // Wait for disconnect grace period to expire
    await new Promise((r) => setTimeout(r, 400));

    expect(streamEndedEventReceived).toBe(true);

    viewerSocket.disconnect();
  }, 18000);

  test('M. Provider is no longer shown as streaming (providerProfile.isLive = false) after unexpected disconnect', async () => {
    const res = await request(app)
      .post('/api/adult/cams/stream/start')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'IsLive Reset Test' });

    const { sessionId } = res.body.data;

    const hostSocket = await createSocketClient(providerToken);
    await new Promise((resolve) => hostSocket.emit('cam:host_start', { sessionId }, (ack: any) => resolve(ack)));

    let provider = await AdultUser.findById(providerId);
    expect(provider?.providerProfile?.isLive).toBe(true);

    hostSocket.disconnect();
    await new Promise((r) => setTimeout(r, 400));

    provider = await AdultUser.findById(providerId);
    expect(provider?.providerProfile?.isLive).toBe(false);
  }, 18000);
});

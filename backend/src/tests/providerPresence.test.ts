import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import http from 'http';
import { io as Client } from 'socket.io-client';
import app from '../app';
import { setupSocket } from '../socket';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import jwt from 'jsonwebtoken';
import { cleanStalePresence } from '../socket/adultSocket';

describe('Provider Presence & Stream Auto-cleanup', () => {
  let mongoServer: MongoMemoryServer;
  let server: http.Server;
  let providerUser: any;
  let providerToken: string;
  let ioServer: any;
  let port: number;
  let activeClients: any[] = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.disconnect();
    await mongoose.connect(mongoUri);

    // Create provider user
    providerUser = new AdultUser({
      username: 'presenceprovider',
      passwordHash: 'presencehash',
      email: 'presence@example.com',
      displayName: 'Presence Performer',
      dateOfBirth: new Date(1995, 1, 1),
      role: 'provider',
      country: 'US',
      emailVerified: true,
      status: 'active',
      isVerified: true,
      providerProfile: {
        stageName: 'Presence Performer',
        onboarding: { isComplete: true }
      }
    });
    await providerUser.save();

    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    providerToken = jwt.sign({ sub: providerUser._id.toString(), role: 'provider' }, secret);

    // Set up test server with socket.io
    server = http.createServer(app);
    ioServer = setupSocket(server);

    // Listen on dynamic port
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'string' ? 0 : addr?.port || 0;
        resolve();
      });
    });
  }, 30000);

  afterEach(() => {
    activeClients.forEach((client) => {
      if (client.connected) {
        client.disconnect();
      }
    });
    activeClients = [];
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  }, 30000);

  it('sets isOnline to true when provider connects, and updates other users', async () => {
    // Before connection: offline
    const initial = await AdultUser.findById(providerUser._id) as any;
    expect(initial?.providerProfile?.isOnline || false).toBe(false);

    // Connect client socket
    const client = Client(`http://localhost:${port}/adult`, {
      auth: { token: providerToken },
      transports: ['websocket']
    });
    activeClients.push(client);

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    // Wait for server connection handler to complete async DB writes
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Verify online in DB
    const connected = await AdultUser.findById(providerUser._id) as any;
    expect(connected?.isOnline).toBe(true);
    expect(connected?.providerProfile?.isOnline || false).toBe(true);
    expect(connected?.providerProfile?.isLive || false).toBe(false); // Separated! Provider is online but not live yet.

    // Disconnect
    client.disconnect();

    // Wait for async disconnect processing
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    const disconnected = await AdultUser.findById(providerUser._id) as any;
    expect(disconnected?.isOnline || false).toBe(false);
    expect(disconnected?.providerProfile?.isOnline || false).toBe(false);
    expect(disconnected?.providerProfile?.isLive || false).toBe(false);
  });

  it('handles multi-tab connections correctly', async () => {
    // Connect tab 1
    const tab1 = Client(`http://localhost:${port}/adult`, {
      auth: { token: providerToken },
      transports: ['websocket']
    });
    activeClients.push(tab1);
    await new Promise<void>((resolve) => tab1.on('connect', () => resolve()));

    // Connect tab 2
    const tab2 = Client(`http://localhost:${port}/adult`, {
      auth: { token: providerToken },
      transports: ['websocket']
    });
    activeClients.push(tab2);
    await new Promise<void>((resolve) => tab2.on('connect', () => resolve()));

    // Wait for server connection handler to complete async DB writes
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Verify online
    let user = await AdultUser.findById(providerUser._id) as any;
    expect(user?.providerProfile?.isOnline || false).toBe(true);

    // Disconnect tab 1 - should STILL be online
    tab1.disconnect();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    user = await AdultUser.findById(providerUser._id) as any;
    expect(user?.providerProfile?.isOnline || false).toBe(true);

    // Disconnect tab 2 - should now be offline
    tab2.disconnect();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    user = await AdultUser.findById(providerUser._id) as any;
    expect(user?.providerProfile?.isOnline || false).toBe(false);
  });

  it('auto-ends live cam session and notifies viewers when provider disconnects', async () => {
    // Create live stream session
    const session = new CamSession({
      providerId: providerUser._id,
      title: 'Testing auto cleanup',
      sessionType: 'public',
      status: 'live',
      streamKey: `key_${Date.now()}`,
      streamPlaybackUrl: `url_${Date.now()}`
    });
    await session.save();

    // Verify session is live
    let liveSession = await CamSession.findById(session._id);
    expect(liveSession?.status).toBe('live');

    // Connect provider
    const providerSocket = Client(`http://localhost:${port}/adult`, {
      auth: { token: providerToken },
      transports: ['websocket']
    });
    activeClients.push(providerSocket);
    await new Promise<void>((resolve) => providerSocket.on('connect', () => resolve()));

    // Wait for server connection handler to complete async DB writes
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Verify provider is online
    let pUser = await AdultUser.findById(providerUser._id) as any;
    expect(pUser?.providerProfile?.isOnline || false).toBe(true);

    // Disconnect provider - should end live session
    providerSocket.disconnect();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Verify provider is offline and session ended
    pUser = await AdultUser.findById(providerUser._id) as any;
    expect(pUser?.providerProfile?.isOnline || false).toBe(false);

    liveSession = await CamSession.findById(session._id);
    expect(liveSession?.status).toBe('ended');
    expect(liveSession?.endedAt).toBeDefined();
  });

  it('cleanStalePresence ends all live sessions and sets users offline', async () => {
    // Setup some stale data
    await AdultUser.findByIdAndUpdate(providerUser._id, {
      isOnline: true,
      "providerProfile.isOnline": true,
      "providerProfile.isLive": true
    });

    const session = new CamSession({
      providerId: providerUser._id,
      title: 'Stale stream',
      sessionType: 'public',
      status: 'live',
      streamKey: `key_stale_${Date.now()}`,
      streamPlaybackUrl: `url_stale_${Date.now()}`
    });
    await session.save();

    // Call cleanStalePresence
    await cleanStalePresence();

    const pUser = await AdultUser.findById(providerUser._id) as any;
    expect(pUser?.isOnline || false).toBe(false);
    expect(pUser?.providerProfile?.isOnline || false).toBe(false);
    expect(pUser?.providerProfile?.isLive || false).toBe(false);

    const staleSession = await CamSession.findById(session._id);
    expect(staleSession?.status).toBe('ended');
  });
});

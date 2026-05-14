import { io, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocket } from '../socket';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User';
import Conversation from '../models/Conversation';
import jwt from 'jsonwebtoken';

describe('Socket Calling Signaling', () => {
  let ioServer: Server;
  let httpServer: any;
  let mongoServer: MongoMemoryServer;
  let port: number;
  let user1Token: string;
  let user2Token: string;
  let user1Id: string;
  let user2Id: string;
  let conversationId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    httpServer = createServer();
    ioServer = setupSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });

    // Create users
    const user1 = await User.create({
      email: 'u1@test.com',
      firstName: 'U1',
      password: 'password',
      dateOfBirth: new Date(1990, 1, 1),
      gender: 'Male'
    });
    user1Id = user1._id.toString();
    user1Token = jwt.sign({ userId: user1Id }, process.env.JWT_SECRET || 'fallback_secret');

    const user2 = await User.create({
      email: 'u2@test.com',
      firstName: 'U2',
      password: 'password',
      dateOfBirth: new Date(1990, 1, 1),
      gender: 'Female'
    });
    user2Id = user2._id.toString();
    user2Token = jwt.sign({ userId: user2Id }, process.env.JWT_SECRET || 'fallback_secret');

    const conversation = await Conversation.create({
      participants: [user1Id, user2Id]
    });
    conversationId = conversation._id.toString();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
    ioServer.close();
    httpServer.close();
  });

  const createSocket = (token: string): Promise<Socket> => {
    return new Promise((resolve) => {
      const socket = io(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket']
      });
      socket.on('connect', () => resolve(socket));
    });
  };

  it('should broadcast call:offer to participants', async () => {
    const socket1 = await createSocket(user1Token);
    const socket2 = await createSocket(user2Token);

    socket2.emit('join:conversation', { conversationId });
    socket1.emit('join:conversation', { conversationId });

    const offerPromise = new Promise<any>((resolve) => {
      socket2.on('call:offer', (data: any) => resolve(data));
    });

    socket1.emit('call:offer', { conversationId, offer: 'sdp-offer', isVideoCall: true });

    const receivedData = await offerPromise;
    expect(receivedData.conversationId).toBe(conversationId);
    expect(receivedData.offer).toBe('sdp-offer');
    expect(receivedData.isVideoCall).toBe(true);

    socket1.disconnect();
    socket2.disconnect();
  });

  it('should broadcast call:end to participants', async () => {
    const socket1 = await createSocket(user1Token);
    const socket2 = await createSocket(user2Token);

    socket2.emit('join:conversation', { conversationId });

    const endPromise = new Promise<any>((resolve) => {
      socket2.on('call:end', (data: any) => resolve(data));
    });

    socket1.emit('call:end', { conversationId });

    const receivedData = await endPromise;
    expect(receivedData.conversationId).toBe(conversationId);

    socket1.disconnect();
    socket2.disconnect();
  });

  it('should broadcast call:reject to participants', async () => {
    const socket1 = await createSocket(user1Token);
    const socket2 = await createSocket(user2Token);

    socket2.emit('join:conversation', { conversationId });

    const rejectPromise = new Promise<any>((resolve) => {
      socket2.on('call:reject', (data: any) => resolve(data));
    });

    socket1.emit('call:reject', { conversationId });

    const receivedData = await rejectPromise;
    expect(receivedData.conversationId).toBe(conversationId);

    socket1.disconnect();
    socket2.disconnect();
  });
});

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import PrivateShowRequest from '../models/PrivateShowRequest';
import { decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';

export const setupAdultSocket = (io: Server) => {
  const adultNamespace = io.of('/adult');

  adultNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));

      const decoded = jwt.verify(token, process.env.ADULT_JWT_SECRET || 'adult_secret') as { sub: string };
      const user = await AdultUser.findById(decoded.sub);

      if (!user || !user.isActive || user.isBanned) return next(new Error('Authentication error'));

      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  adultNamespace.on('connection', (socket: Socket) => {
    console.log(`Adult Socket connected: ${socket.id}`);

    // Room events
    socket.on('room:join', (roomId: string) => {
      socket.join(`room:${roomId}`);
      adultNamespace.to(`room:${roomId}`).emit('room:userJoined', { userId: socket.data.user._id, count: adultNamespace.adapter.rooms.get(`room:${roomId}`)?.size });
    });

    socket.on('room:leave', (roomId: string) => {
      socket.leave(`room:${roomId}`);
      adultNamespace.to(`room:${roomId}`).emit('room:userLeft', { userId: socket.data.user._id, count: adultNamespace.adapter.rooms.get(`room:${roomId}`)?.size });
    });

    socket.on('room:sendMessage', (data: { roomId: string, content: string }) => {
        adultNamespace.to(`room:${data.roomId}`).emit('room:message', {
            senderId: socket.data.user._id,
            username: socket.data.user.username,
            content: data.content,
            createdAt: new Date(),
        });
    });

    // Private Chat events
    socket.on('chat:typing', (data: { receiverId: string, isTyping: boolean }) => {
        adultNamespace.to(`user:${data.receiverId}`).emit('chat:typing', {
            senderId: socket.data.user._id,
            isTyping: data.isTyping
        });
    });

    // Cam Events
    socket.on('cam:join', async (sessionId: string) => {
      try {
        const session = await CamSession.findById(sessionId);
        if (!session || session.status !== 'live') return;

        socket.join(`cam:${sessionId}`);

        await CamViewer.findOneAndUpdate(
          { sessionId, userId: socket.data.user._id },
          {
            $setOnInsert: { joinedAt: new Date() },
            $set: { deviceType: 'desktop' } // Simplified
          },
          { upsert: true }
        );

        const viewerCount = adultNamespace.adapter.rooms.get(`cam:${sessionId}`)?.size || 0;
        adultNamespace.to(`cam:${sessionId}`).emit('cam:viewerCount', viewerCount);
      } catch (err) {
        console.error('Cam join error:', err);
      }
    });

    socket.on('cam:leave', async (sessionId: string) => {
      socket.leave(`cam:${sessionId}`);
      const viewerCount = adultNamespace.adapter.rooms.get(`cam:${sessionId}`)?.size || 0;
      adultNamespace.to(`cam:${sessionId}`).emit('cam:viewerCount', viewerCount);

      await CamViewer.findOneAndUpdate(
        { sessionId, userId: socket.data.user._id },
        { leftAt: new Date() }
      );
    });

    socket.on('cam:privateRequest', async (data: { sessionId: string }) => {
      try {
        const session = await CamSession.findById(data.sessionId);
        if (!session) return;

        const request = new PrivateShowRequest({
          sessionId: session._id,
          requesterId: socket.data.user._id,
          providerId: session.providerId,
          creditsPerMinute: session.privateShowRate,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
        });
        await request.save();

        adultNamespace.to(`user:${session.providerId}`).emit('cam:privateRequestReceived', {
          requestId: request._id,
          requester: {
            id: socket.data.user._id,
            username: socket.data.user.username
          }
        });
      } catch (err) {
        console.error('Private request error:', err);
      }
    });

    socket.on('cam:privateAccept', async (data: { requestId: string }) => {
      try {
        const request = await PrivateShowRequest.findById(data.requestId);
        if (!request || request.providerId.toString() !== socket.data.user._id.toString()) return;

        request.status = 'accepted';
        request.startedAt = new Date();
        await request.save();

        adultNamespace.to(`user:${request.requesterId}`).emit('cam:privateAccepted', {
          requestId: request._id,
          sessionId: request.sessionId
        });

        // Start credit deduction ticker
        const ticker = setInterval(async () => {
          const session = await PrivateShowRequest.findById(request._id);
          if (!session || session.status !== 'accepted') {
            clearInterval(ticker);
            return;
          }

          const user = await AdultUser.findById(session.requesterId);
          if (!user || user.credits < session.creditsPerMinute) {
            session.status = 'ended';
            session.endedAt = new Date();
            await session.save();
            adultNamespace.to(`user:${session.requesterId}`).emit('cam:privateEnded', { reason: 'insufficient_credits' });
            adultNamespace.to(`user:${session.providerId}`).emit('cam:privateEnded', { reason: 'insufficient_credits' });
            clearInterval(ticker);
            return;
          }

          // Use transaction for atomic update
          const mongoSession = await mongoose.startSession();
          try {
            mongoSession.startTransaction();
            await AdultUser.findByIdAndUpdate(user._id, { $inc: { credits: -session.creditsPerMinute } }, { session: mongoSession });
            await AdultUser.findByIdAndUpdate(session.providerId, { $inc: { 'providerProfile.totalEarnings': session.creditsPerMinute } }, { session: mongoSession });
            await PrivateShowRequest.findByIdAndUpdate(session._id, { $inc: { totalCreditsSpent: session.creditsPerMinute } }, { session: mongoSession });
            await mongoSession.commitTransaction();

            adultNamespace.to(`user:${session.requesterId}`).emit('credits:updated', user.credits - session.creditsPerMinute);
          } catch (e) {
            await mongoSession.abortTransaction();
          } finally {
            mongoSession.endSession();
          }
        }, 60000); // Every minute
      } catch (err) {
        console.error('Private accept error:', err);
      }
    });

    // Individual user room for notifications
    socket.join(`user:${socket.data.user._id}`);

    socket.on('disconnect', () => {
      console.log(`Adult Socket disconnected: ${socket.id}`);
    });
  });
};

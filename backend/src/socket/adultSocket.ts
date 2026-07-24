import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import PrivateShowRequest from '../models/PrivateShowRequest';
import { decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';
import { getClientPrice } from '../services/pricingService';
import app from '../app';

// Centralized map for active call tickers accessible across all socket connections in the adult namespace
const activeCallTickers = new Map<string, NodeJS.Timeout>();

export const setupAdultSocket = (io: Server) => {
  const adultNamespace = io.of('/adult');

  // Attach namespace to express app for access in REST controllers
  app.set('adultNamespace', adultNamespace);

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

    // Room events (for both standard rooms and naughty rooms)
    socket.on('room:join', (data: any) => {
      const roomId = typeof data === 'string' ? data : data?.roomId;
      if (!roomId) return;
      socket.join(`room:${roomId}`);
      adultNamespace.to(`room:${roomId}`).emit('room:userJoined', { userId: socket.data.user._id, count: adultNamespace.adapter.rooms.get(`room:${roomId}`)?.size });
    });

    socket.on('room:leave', (data: any) => {
      const roomId = typeof data === 'string' ? data : data?.roomId;
      if (!roomId) return;
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

    socket.on('room:typing', (data: { roomId: string }) => {
      if (!data || !data.roomId) return;
      const { roomId } = data;
      socket.to(`room:${roomId}`).emit('room:typing', {
        userId: socket.data.user._id,
        displayName: socket.data.user.displayName || socket.data.user.username,
      });
    });

    socket.on('room:stop_typing', (data: { roomId: string }) => {
      // Can be used to clear typing list if needed
    });

    socket.on('thread:join', (data: { threadId: string }) => {
      if (!data || !data.threadId) return;
      const { threadId } = data;
      socket.join(`thread:${threadId}`);
    });

    socket.on('thread:leave', (data: { threadId: string }) => {
      if (!data || !data.threadId) return;
      const { threadId } = data;
      socket.leave(`thread:${threadId}`);
    });

    socket.on('thread:typing', (data: { threadId: string }) => {
      if (!data || !data.threadId) return;
      const { threadId } = data;
      socket.to(`thread:${threadId}`).emit('thread:typing', {
        userId: socket.data.user._id,
        displayName: socket.data.user.displayName || socket.data.user.username,
      });
    });

    socket.on('thread:stop_typing', (data: { threadId: string }) => {
      // Thread stop typing
    });

    // Private Chat events
    socket.on('chat:typing', (data: { receiverId: string, isTyping: boolean }) => {
        adultNamespace.to(`user:${data.receiverId}`).emit('chat:typing', {
            senderId: socket.data.user._id,
            isTyping: data.isTyping
        });
    });

    // Conversation room events
    socket.on('conv:join', (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      socket.join(`conv:${data.conversationId}`);
    });

    socket.on('conv:leave', (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      socket.leave(`conv:${data.conversationId}`);
    });

    socket.on('sext:typing', (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      socket.to(`conv:${data.conversationId}`).emit('sext:typing', {
        userId: socket.data.user._id,
        displayName: socket.data.user.displayName || socket.data.user.username
      });
    });

    socket.on('sext:stop_typing', (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      socket.to(`conv:${data.conversationId}`).emit('sext:stop_typing', {
        userId: socket.data.user._id
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

        // The user sees/agrees to the marked-up price, but we save the base creditsPerMinute in the show request
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

        // Start credit deduction ticker with 15% markup
        const ticker = setInterval(async () => {
          const session = await PrivateShowRequest.findById(request._id);
          if (!session || session.status !== 'accepted') {
            clearInterval(ticker);
            return;
          }

          const user = await AdultUser.findById(session.requesterId);
          const markedUpRate = getClientPrice(session.creditsPerMinute);

          if (!user || user.credits < markedUpRate) {
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
            await AdultUser.findByIdAndUpdate(user._id, { $inc: { credits: -markedUpRate } }, { session: mongoSession });
            await AdultUser.findByIdAndUpdate(session.providerId, { $inc: { credits: session.creditsPerMinute, 'providerProfile.totalEarnings': session.creditsPerMinute } }, { session: mongoSession });
            await PrivateShowRequest.findByIdAndUpdate(session._id, { $inc: { totalCreditsSpent: markedUpRate } }, { session: mongoSession });
            await mongoSession.commitTransaction();

            adultNamespace.to(`user:${session.requesterId}`).emit('credits:updated', user.credits - markedUpRate);
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

    // --- Call Signaling & Call Billing ---
    socket.on('call:request', async (data: { providerId: string, isVideo: boolean }) => {
      try {
        const provider = await AdultUser.findById(data.providerId);
        if (!provider || provider.role !== 'provider' || !provider.providerProfile) {
          socket.emit('call:error', { message: 'Provider not found or invalid' });
          return;
        }

        const rate = data.isVideo ? (provider.providerProfile.videoCallPrice || 0) : (provider.providerProfile.audioCallPrice || 0);
        const userPrice = getClientPrice(rate);

        if (socket.data.user.credits < userPrice) {
          socket.emit('call:error', { message: 'Insufficient credits to start this call' });
          return;
        }

        adultNamespace.to(`user:${provider._id}`).emit('call:incoming', {
          callerId: socket.data.user._id,
          callerUsername: socket.data.user.username,
          isVideo: data.isVideo,
          rate: userPrice,
        });
      } catch (err) {
        console.error('Call request error:', err);
      }
    });

    socket.on('call:accept', async (data: { callerId: string, isVideo: boolean }) => {
      try {
        const provider = socket.data.user;
        const caller = await AdultUser.findById(data.callerId);
        if (!caller) return;

        const rate = data.isVideo ? (provider.providerProfile.videoCallPrice || 0) : (provider.providerProfile.audioCallPrice || 0);
        const userPrice = getClientPrice(rate);

        if (caller.credits < userPrice) {
          socket.emit('call:error', { message: 'User has insufficient credits' });
          adultNamespace.to(`user:${data.callerId}`).emit('call:rejected', { reason: 'insufficient_credits' });
          return;
        }

        const callId = `${data.callerId}_${provider._id}`;

        adultNamespace.to(`user:${data.callerId}`).emit('call:accepted', {
          providerId: provider._id,
          isVideo: data.isVideo,
          callId
        });

        socket.join(`call:${callId}`);
      } catch (err) {
        console.error('Call accept error:', err);
      }
    });

    socket.on('call:reject', (data: { callerId: string }) => {
      adultNamespace.to(`user:${data.callerId}`).emit('call:rejected', { reason: 'declined' });
    });

    socket.on('call:end', (data: { callId: string }) => {
      const ticker = activeCallTickers.get(data.callId);
      if (ticker) {
        clearInterval(ticker);
        activeCallTickers.delete(data.callId);
      }
      adultNamespace.to(`call:${data.callId}`).emit('call:ended', { reason: 'ended' });
    });

    socket.on('call:join', (data: { callId: string }) => {
      socket.join(`call:${data.callId}`);
    });

    // Individual user room for notifications
    socket.join(`user:${socket.data.user._id}`);

    socket.on('disconnect', () => {
      console.log(`Adult Socket disconnected: ${socket.id}`);
      // Clean up any active tickers associated with this user/provider
      for (const [callId, ticker] of activeCallTickers.entries()) {
        if (callId.includes(socket.data.user._id.toString())) {
          clearInterval(ticker);
          activeCallTickers.delete(callId);
          adultNamespace.to(`call:${callId}`).emit('call:ended', { reason: 'participant_disconnected' });
        }
      }
    });
  });
};

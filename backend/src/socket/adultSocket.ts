import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import PrivateShowRequest from '../models/PrivateShowRequest';
import AdultMessage from '../models/AdultMessage';
import AdultCall from '../models/AdultCall';
import { encrypt, decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';
import { getClientPrice } from '../services/pricingService';
import app from '../app';
import Redis from 'ioredis';
import { billCallMinute } from '../controllers/adultSext.controller';
import { checkActiveCall } from '../services/sessionInvariantService';

let redisClient: Redis | null = null;
if (process.env.NODE_ENV !== 'test' && (process.env.REDIS_URL || process.env.REDIS_HOST)) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '', { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  } catch (err) {
    console.warn('Failed to initialize Redis client inside adultSocket, falling back to in-memory tracking:', err);
  }
}

// In-memory fallback
const inMemoryOnlineSockets = new Map<string, Set<string>>();

export const addActiveConnection = async (userId: string, socketId: string) => {
  if (redisClient) {
    try {
      await redisClient.sadd(`adult:online:${userId}`, socketId);
      return;
    } catch (err) {
      console.warn('Redis sAdd error, falling back to in-memory:', err);
    }
  }
  if (!inMemoryOnlineSockets.has(userId)) {
    inMemoryOnlineSockets.set(userId, new Set());
  }
  inMemoryOnlineSockets.get(userId)!.add(socketId);
};

export const removeActiveConnection = async (userId: string, socketId: string) => {
  if (redisClient) {
    try {
      await redisClient.srem(`adult:online:${userId}`, socketId);
      return;
    } catch (err) {
      console.warn('Redis sRem error, falling back to in-memory:', err);
    }
  }
  const userSockets = inMemoryOnlineSockets.get(userId);
  if (userSockets) {
    userSockets.delete(socketId);
    if (userSockets.size === 0) {
      inMemoryOnlineSockets.delete(userId);
    }
  }
};

export const getActiveConnectionCount = async (userId: string): Promise<number> => {
  if (redisClient) {
    try {
      return await redisClient.scard(`adult:online:${userId}`);
    } catch (err) {
      console.warn('Redis sCard error, falling back to in-memory:', err);
    }
  }
  return inMemoryOnlineSockets.get(userId)?.size || 0;
};

export const cleanStalePresence = async () => {
  if (redisClient) {
    try {
      const keys = await redisClient.keys('adult:online:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (err) {
      console.warn('Redis error during startup cleanup:', err);
    }
  }

  // Mark ALL providers as offline on startup
  await AdultUser.updateMany(
    { role: 'provider' },
    { $set: { 'providerProfile.isOnline': false, 'providerProfile.onlineSince': null } }
  );

  // Mark ALL users as offline on startup
  await AdultUser.updateMany(
    { role: 'user' },
    { $set: { isOnline: false, onlineSince: null } }
  );

  // End ALL active cam sessions (they cannot survive a server restart)
  const staleSessions = await CamSession.find({ status: 'live' });
  for (const session of staleSessions) {
    await CamSession.findByIdAndUpdate(session._id, {
      $set: { status: 'ended', endedAt: new Date() },
    });
  }

  console.log(`Cleaned up ${staleSessions.length} stale cam sessions on startup`);
};

export const updateCamSpectatorCount = async (ns: any, sessionId: string) => {
  try {
    const room = ns.adapter?.rooms?.get(`cam:${sessionId}`);
    if (!room) {
      ns.to(`cam:${sessionId}`).emit('cam:viewerCount', 0);
      ns.to(`cam:${sessionId}`).emit('cam:viewer_count', { count: 0 });
      return 0;
    }

    const session = await CamSession.findById(sessionId).select('providerId peakViewerCount');
    if (!session) return 0;

    const providerIdStr = session.providerId.toString();
    const uniqueViewers = new Set<string>();

    const socketsMap = ns.sockets?.sockets || ns.sockets;

    for (const socketId of room) {
      const socket = socketsMap?.get ? (socketsMap.get(socketId) || socketsMap.get(`/adult#${socketId}`) || socketsMap.get(socketId.replace(/^\/adult#/, ''))) : null;
      if (socket && socket.data && socket.data.user) {
        const uId = socket.data.user._id.toString();
        if (uId !== providerIdStr) {
          uniqueViewers.add(uId);
        }
      }
    }

    const currentCount = uniqueViewers.size;

    ns.to(`cam:${sessionId}`).emit('cam:viewerCount', currentCount);
    ns.to(`cam:${sessionId}`).emit('cam:viewer_count', { count: currentCount });

    if (currentCount > (session.peakViewerCount || 0)) {
      await CamSession.updateOne(
        {
          _id: sessionId,
          $or: [
            { peakViewerCount: { $lt: currentCount } },
            { peakViewerCount: { $exists: false } }
          ]
        },
        { $set: { peakViewerCount: currentCount } }
      );
    }

    return currentCount;
  } catch (err) {
    console.error('Error in updateCamSpectatorCount:', err);
    return 0;
  }
};

export const handleProviderGoesOffline = async (userId: string, namespace: any) => {
  // 1. Mark provider as offline
  await AdultUser.findByIdAndUpdate(
    userId,
    { $set: { 'providerProfile.isOnline': false, 'providerProfile.onlineSince': null } }
  );

  // 2. End any active cam session for this provider
  const activeSession = await CamSession.findOne({
    providerId: userId,
    status: 'live',
  });

  if (activeSession) {
    await CamSession.findByIdAndUpdate(activeSession._id, {
      $set: {
        status: 'ended',
        endedAt: new Date(),
      },
    });

    // 3. Tell all viewers in this cam room that the stream ended
    namespace.to(`cam:${activeSession._id}`).emit('cam:session_ended', {
      sessionId: activeSession._id.toString(),
      reason: 'provider_disconnected',
    });

    // 4. Remove from the global live list
    namespace.emit('cam:session_ended', {
      sessionId: activeSession._id.toString(),
    });

    console.log(`Auto-ended cam session ${activeSession._id} because provider ${userId} disconnected`);
  }

  // 5. Tell members browsing that this provider went offline
  namespace.emit('provider:offline', {
    providerId: userId,
    isOnline: false,
  });
};

// Centralized map for active call tickers accessible across all socket connections in the adult namespace
const activeCallTickers = new Map<string, NodeJS.Timeout>();

export const monitorActiveCalls = async (ns: any) => {
  try {
    const activeCalls = await AdultCall.find({ status: 'active' });
    const now = new Date();

    for (const call of activeCalls) {
      if (!call.startedAt) continue;

      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - call.startedAt.getTime()) / 1000));
      // Determine how many minutes are required based on elapsed time:
      // minute 1: 0-59s, minute 2: 60-119s, minute 3: 120-179s, etc.
      const neededMinutes = Math.floor(elapsedSeconds / 60) + 1;

      if (neededMinutes > call.billedMinutes) {
        for (let min = call.billedMinutes + 1; min <= neededMinutes; min++) {
          const billResult = await billCallMinute(call._id.toString(), min, ns);
          if (!billResult.success) {
            // Conditional debit failed: caller cannot pay for next minute! Terminate call immediately.
            call.status = 'ended';
            call.endedAt = new Date();
            call.endReason = 'insufficient_credits';
            call.durationSeconds = elapsedSeconds;
            call.isActiveSession = false;
            call.activeParticipants = [];
            await call.save();

            // Insert system message
            const systemMsg = new AdultMessage({
              conversationId: call.conversationId,
              senderId: call.callerId,
              receiverId: call.receiverId,
              content: encrypt("Call ended due to insufficient credits"),
              messageType: 'system',
              systemText: "Call ended due to insufficient credits"
            });
            await systemMsg.save();

            if (ns) {
              ns.to(`user:${call.callerId.toString()}`).emit('call:ended', {
                callId: call._id.toString(),
                durationSeconds: elapsedSeconds,
                creditsDeducted: call.creditsDeducted,
                reason: 'insufficient_credits'
              });
              ns.to(`user:${call.receiverId.toString()}`).emit('call:ended', {
                callId: call._id.toString(),
                durationSeconds: elapsedSeconds,
                creditsDeducted: call.creditsDeducted,
                reason: 'insufficient_credits'
              });
              ns.to(`call:${call._id.toString()}`).emit('call:ended', {
                callId: call._id.toString(),
                reason: 'insufficient_credits'
              });
            }
            break; // Stop processing further minutes for this call
          }
        }
      }
    }
  } catch (err) {
    console.error('Error monitoring active calls:', err);
  }
};

export const setupAdultSocket = (io: Server) => {
  const adultNamespace = io.of('/adult');

  // Attach namespace to express app for access in REST controllers
  app.set('adultNamespace', adultNamespace);

  // Set up periodic call monitoring for active calls (every 3 seconds)
  const billingInterval = setInterval(() => {
    monitorActiveCalls(adultNamespace).catch(err => {
      console.error('Error in monitorActiveCalls interval:', err);
    });
  }, 3000);
  billingInterval.unref?.();

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

  adultNamespace.on('connection', async (socket: Socket) => {
    console.log(`Adult Socket connected: ${socket.id}`);
    const user = socket.data.user;
    if (!user) return;
    const userId = user._id.toString();
    const accountType = user.role; // 'provider' or 'user'

    // Join personal user room immediately
    socket.join(`user:${userId}`);

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

    socket.on('sext:message_delivered', async ({ messageId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(messageId)) return;
        const msg = await AdultMessage.findByIdAndUpdate(
          messageId,
          { $set: { deliveredAt: new Date() } },
          { new: true }
        );
        if (msg) {
          // Tell the SENDER their message was delivered
          adultNamespace.to(`user:${msg.senderId}`).emit('sext:message_status_update', {
            messageId,
            status: 'delivered',
            deliveredAt: msg.deliveredAt,
          });
        }
      } catch (err) {
        console.error('Error handling sext:message_delivered:', err);
      }
    });

    // Cam Events
    socket.on('cam:join', async (data: any) => {
      try {
        const sessionId = typeof data === 'string' ? data : data?.sessionId;
        if (!sessionId) return;

        await socket.join(`cam:${sessionId}`);
        if (!socket.data.camRooms) {
          socket.data.camRooms = new Set<string>();
        }
        socket.data.camRooms.add(sessionId);

        await updateCamSpectatorCount(adultNamespace, sessionId);

        try {
          await CamViewer.findOneAndUpdate(
            { sessionId, userId: socket.data.user._id },
            {
              $setOnInsert: { joinedAt: new Date() },
              $set: { deviceType: 'desktop' } // Simplified
            },
            { upsert: true }
          );
        } catch (dbErr) {
          console.warn('Non-blocking cam viewer join tracking failed:', dbErr);
        }
      } catch (err) {
        console.error('Cam join error:', err);
      }
    });

    socket.on('cam:leave', async (data: any) => {
      try {
        const sessionId = typeof data === 'string' ? data : data?.sessionId;
        if (!sessionId) return;

        await socket.leave(`cam:${sessionId}`);
        if (socket.data.camRooms) {
          socket.data.camRooms.delete(sessionId);
        }

        await updateCamSpectatorCount(adultNamespace, sessionId);

        try {
          await CamViewer.findOneAndUpdate(
            { sessionId, userId: socket.data.user._id },
            { leftAt: new Date() }
          );
        } catch (dbErr) {
          console.warn('Non-blocking cam viewer leave tracking failed:', dbErr);
        }
      } catch (err) {
        console.error('Cam leave error:', err);
      }
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

        const callerActive = await checkActiveCall(socket.data.user._id);
        if (callerActive) {
          socket.emit('call:error', { message: 'You are already on a call on another device.' });
          return;
        }

        const providerActive = await checkActiveCall(provider._id);
        if (providerActive) {
          socket.emit('call:error', { message: 'The other user is currently in another call.' });
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

    socket.on('call:accept', async (data: { callerId: string, isVideo: boolean, callId?: string }) => {
      try {
        const provider = socket.data.user;
        const caller = await AdultUser.findById(data.callerId);
        if (!caller) return;

        const callId = data.callId || `${data.callerId}_${provider._id}`;

        const callerActive = await checkActiveCall(data.callerId);
        if (callerActive && callerActive._id.toString() !== callId) {
          socket.emit('call:error', { message: 'The caller is currently in another call.' });
          return;
        }

        const providerActive = await checkActiveCall(provider._id);
        if (providerActive && providerActive._id.toString() !== callId) {
          socket.emit('call:error', { message: 'You are already on a call on another device.' });
          return;
        }

        const rate = data.isVideo ? (provider.providerProfile?.videoCallPrice || provider.providerProfile?.pricePerMinute || 0) : (provider.providerProfile?.audioCallPrice || provider.providerProfile?.pricePerMinute || 0);
        const userPrice = getClientPrice(rate);

        let call = await AdultCall.findById(callId);

        if (!call) {
          // If call record doesn't exist yet, create it
          const conversationId = [data.callerId, provider._id.toString()].sort().join('_');
          call = new AdultCall({
            _id: callId,
            conversationId,
            callerId: data.callerId,
            receiverId: provider._id,
            activeParticipants: [data.callerId, provider._id],
            isActiveSession: true,
            type: data.isVideo ? 'video' : 'audio',
            status: 'ringing',
            perMinuteRate: rate,
            webrtcRoomId: `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`
          });
          try {
            await call.save();
          } catch (err: any) {
            socket.emit('call:error', { message: 'You are already on a call on another device.' });
            return;
          }
        }

        // Bill Minute 1 atomically before marking as active
        const billResult = await billCallMinute(call._id.toString(), 1, adultNamespace);
        if (!billResult.success) {
          socket.emit('call:error', { message: 'User has insufficient credits' });
          adultNamespace.to(`user:${data.callerId}`).emit('call:rejected', { reason: 'insufficient_credits' });
          return;
        }

        call.status = 'active';
        call.isActiveSession = true;
        call.activeParticipants = [call.callerId, call.receiverId];
        call.startedAt = new Date();
        await call.save();

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

    // EPHEMERAL CAM CHAT ROOM CHAT MESSAGE
    socket.on('cam:chat_message', async ({ sessionId, content }) => {
      try {
        if (!content || content.trim().length === 0) return;
        if (content.length > 200) return;

        // Contact sharing content filtering check using direct import or shared content filter
        try {
          const { detectContactSharing } = require('@yourapp/content-filter');
          const { detected } = detectContactSharing(content);
          if (detected) return; // silently drop as specified
        } catch (err) {
          console.warn('content-filter package not loaded, skipped checks:', err);
        }

        const message = {
          id: `msg_${Date.now()}_${socket.data.user._id}`,
          senderId: socket.data.user._id,
          senderName: socket.data.user.displayName || socket.data.user.username || 'Member',
          senderBadge: socket.data.user.subscriptionTier === 'none' ? null : socket.data.user.subscriptionTier,
          content: content.trim(),
          timestamp: Date.now(),
          type: 'chat',
        };

        // Broadcast to everyone in the cam room
        adultNamespace.to(`cam:${sessionId}`).emit('cam:new_message', message);
      } catch (err: any) {
        const { captureError } = require('../utils/captureError');
        await captureError(err, {
          operation: 'socket_cam_chat',
          userId: socket.data.user?._id?.toString() || null,
          zone: 'adult',
          data: { sessionId },
        });
      }
    });

    // Individual user room for notifications is already joined above!

    // Asynchronously perform presence & DB updates in background so socket listeners are ready immediately
    (async () => {
      // Track active connection
      await addActiveConnection(userId, socket.id);

      // Mark user as online
      if (accountType === 'provider') {
        await AdultUser.findByIdAndUpdate(
          userId,
          { $set: { 'providerProfile.isOnline': true, 'providerProfile.onlineSince': new Date() } }
        );

        // Notify members that this provider came online
        adultNamespace.emit('provider:online', {
          providerId: userId,
          isOnline: true,
        });
      } else {
        // Standard member
        await AdultUser.findByIdAndUpdate(
          userId,
          { $set: { isOnline: true, onlineSince: new Date() } }
        );
      }

      // Broadcast user status change globally in the adult namespace
      adultNamespace.emit('user:status', {
        userId,
        isOnline: true,
      });
    })().catch(err => console.error('Error in async connection setup:', err));

    socket.on('disconnect', async (reason) => {
      console.log(`Adult Socket disconnected: ${socket.id} reason: ${reason}`);

      // Clean up active cam rooms and update spectator counts
      if (socket.data.camRooms && socket.data.camRooms.size > 0) {
        for (const sId of socket.data.camRooms) {
          updateCamSpectatorCount(adultNamespace, sId).catch(err => console.error('Error updating spectator count on disconnect:', err));
        }
        socket.data.camRooms.clear();
      }

      // Clean up any active tickers associated with this user/provider
      for (const [callId, ticker] of activeCallTickers.entries()) {
        if (callId.includes(userId)) {
          clearInterval(ticker);
          activeCallTickers.delete(callId);
          adultNamespace.to(`call:${callId}`).emit('call:ended', { reason: 'participant_disconnected' });
        }
      }

      // Remove active connection
      await removeActiveConnection(userId, socket.id);

      // Check remaining connections
      const remainingConnections = await getActiveConnectionCount(userId);
      if (remainingConnections === 0) {
        const userActiveCall = await checkActiveCall(userId);
        if (userActiveCall) {
          userActiveCall.status = 'ended';
          userActiveCall.endedAt = new Date();
          userActiveCall.endReason = 'participant_disconnected';
          userActiveCall.isActiveSession = false;
          userActiveCall.activeParticipants = [];
          await userActiveCall.save();
        }

        if (accountType === 'provider') {
          await handleProviderGoesOffline(userId, adultNamespace);
        } else {
          // Member went offline
          await AdultUser.findByIdAndUpdate(
            userId,
            { $set: { isOnline: false } }
          );
        }

        // Broadcast user status change globally in the adult namespace
        adultNamespace.emit('user:status', {
          userId,
          isOnline: false,
        });
      }
    });
  });
};

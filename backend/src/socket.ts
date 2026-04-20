import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import Conversation from './models/Conversation';
import User from './models/User';
import { IConversation, IUser } from './types/models';
import { Types } from 'mongoose';

let ioInstance: Server;
const userSocketMap = new Map<string, Set<string>>(); // Stores a Set of socket IDs per userId

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export const setupSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });
  ioInstance = io;

  // Authenticate socket
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      console.log('No token provided for socket');
      return next(new Error('Authentication error'));
    }
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback_secret',
      ) as { userId: string };
      socket.userId = decoded.userId;
      console.log('Socket authenticated for user:', socket.userId);
      next();
    } catch (err) {
      console.log('Invalid token for socket');
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log('Socket connected for user:', socket.userId);
    const userId = socket.userId;
    if (!userId) return;

    // Join user room
    socket.join(userId);

    // Update user status to online
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    const userSockets = userSocketMap.get(userId)!;
    const isFirstConnection = userSockets.size === 0;
    userSockets.add(socket.id);

    if (isFirstConnection) {
      try {
        await User.findByIdAndUpdate(userId, {
          isOnline: true,
          lastActive: new Date(),
        });
        io.emit('user:status', { userId, isOnline: true });
        console.log(`User ${userId} is now online`);
      } catch (err) {
        console.error('Error updating user status to online:', err);
      }
    }

    // Explicit online/offline events for compatibility
    socket.on('user:online', async () => {
      const targetUserId = userId;
      if (!userSocketMap.has(targetUserId)) {
        userSocketMap.set(targetUserId, new Set());
      }
      const userSockets = userSocketMap.get(targetUserId)!;
      const isNewlyOnline = userSockets.size === 0;
      userSockets.add(socket.id);

      if (isNewlyOnline) {
        try {
          await User.findByIdAndUpdate(targetUserId, {
            isOnline: true,
            lastActive: new Date(),
          });
          io.emit('user:status', { userId: targetUserId, isOnline: true });
        } catch (err) {
          console.error('Error updating user status to online:', err);
        }
      }
    });

    socket.on('user:offline', async () => {
      const targetUserId = userId;
      const userSockets = userSocketMap.get(targetUserId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketMap.delete(targetUserId);
          try {
            await User.findByIdAndUpdate(targetUserId, {
              isOnline: false,
              lastActive: new Date(),
            });
            io.emit('user:status', { userId: targetUserId, isOnline: false });
          } catch (err) {
            console.error('Error updating user status to offline:', err);
          }
        }
      }
    });

    // Join conversation room
    socket.on('join:conversation', (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      socket.join(data.conversationId);
    });

    // Real-time message relay
    socket.on('message', (message: { conversation?: string; receiver?: string }) => {
      if (!message) return;
      // Broadcast to all in the conversation room except sender
      if (message.conversation) {
        socket.to(message.conversation).emit('message', message);
      }
      // Optionally, also emit to receiver's user room for redundancy
      if (message.receiver) {
        socket.to(message.receiver).emit('message', message);
      }
    });

    // Typing indicator
    socket.on('typing', (data: { conversationId: string; userId: string }) => {
      if (!data || !data.conversationId || !data.userId) return;
      const { conversationId, userId } = data;
      socket.to(conversationId).emit('typing', { userId });
    });
    socket.on('stopTyping', (data: { conversationId: string; userId: string }) => {
      if (!data || !data.conversationId || !data.userId) return;
      const { conversationId, userId } = data;
      socket.to(conversationId).emit('stopTyping', { userId });
    });

    // Video/Audio call signaling
    socket.on('call:offer', async (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      try {
        const conversation = await Conversation.findById(data.conversationId) as IConversation | null;
        if (!conversation) return;

        const otherParticipant = conversation.participants.find(
          (participant: Types.ObjectId) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) return;

        socket.to(data.conversationId).emit('call:offer', data);
        socket.to(otherParticipant.toString()).emit('call:offer', data);
      } catch (error) {
        console.error('Error handling call offer:', error);
      }
    });

    socket.on('call:answer', async (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      try {
        const conversation = await Conversation.findById(data.conversationId) as IConversation | null;
        if (!conversation) return;

        const otherParticipant = conversation.participants.find(
          (participant: Types.ObjectId) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) return;

        socket.to(data.conversationId).emit('call:answer', data);
        socket.to(otherParticipant.toString()).emit('call:answer', data);
      } catch (error) {
        console.error('Error handling call answer:', error);
      }
    });

    socket.on('call:ice-candidate', async (data: { conversationId: string }) => {
      if (!data || !data.conversationId) return;
      try {
        const conversation = await Conversation.findById(data.conversationId) as IConversation | null;
        if (!conversation) return;

        const otherParticipant = conversation.participants.find(
          (participant: Types.ObjectId) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) return;

        socket.to(data.conversationId).emit('call:ice-candidate', data);
        socket.to(otherParticipant.toString()).emit('call:ice-candidate', data);
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log('Socket disconnected for user:', userId);

      const userSockets = userSocketMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketMap.delete(userId);
          try {
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              lastActive: new Date(),
            });
            io.emit('user:status', { userId, isOnline: false });
            console.log(`User ${userId} is now offline`);
          } catch (err) {
            console.error('Error updating user status to offline:', err);
          }
        }
      }
    });
  });

  return io;
};

export const getIO = (): Server | undefined => ioInstance;
export { userSocketMap };

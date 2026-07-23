import Redis from 'ioredis';
import { RandomMatch } from '../models/RandomMatch';
import { generateZegoToken } from './zego.service';
import mongoose from 'mongoose';
import { getIO } from '../socket';

let redisClient: Redis | null = null;
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '');
  } catch (err) {
    console.warn('Failed to initialize Redis client for matching queue, using memory fallback:', err);
  }
}

// In-Memory Fallback Queue store
const memoryQueue = new Map<string, { userId: string; mode: string; joinedAt: number }>();

const QUEUE_KEY = 'adult:random:queue';

export const joinQueue = async (userId: string, mode: string = 'video') => {
  if (redisClient) {
    try {
      const existing = await redisClient.hget(QUEUE_KEY, userId);
      if (existing) return { status: 'waiting' };

      await redisClient.hset(
        QUEUE_KEY,
        userId,
        JSON.stringify({
          userId,
          mode,
          joinedAt: Date.now(),
        })
      );
    } catch (err) {
      console.warn('Redis queue write failed, falling back to memory queue:', err);
      memoryQueue.set(userId, { userId, mode, joinedAt: Date.now() });
    }
  } else {
    memoryQueue.set(userId, { userId, mode, joinedAt: Date.now() });
  }

  return tryMatch(userId, mode);
};

export const leaveQueue = async (userId: string) => {
  if (redisClient) {
    try {
      await redisClient.hdel(QUEUE_KEY, userId);
    } catch (err) {
      console.warn('Redis queue delete failed:', err);
    }
  }
  memoryQueue.delete(userId);
};

export const tryMatch = async (userId: string, mode: string = 'video'): Promise<any> => {
  let allWaiting: any[] = [];

  if (redisClient) {
    try {
      const data = await redisClient.hgetall(QUEUE_KEY);
      allWaiting = Object.values(data).map((str) => JSON.parse(str));
    } catch (err) {
      console.warn('Redis hgetall failed:', err);
      allWaiting = Array.from(memoryQueue.values());
    }
  } else {
    allWaiting = Array.from(memoryQueue.values());
  }

  // Find a compatible candidate (not self)
  const candidates = allWaiting
    .filter((u) => u.userId !== userId)
    .filter((u) => u.mode === mode || u.mode === 'both' || mode === 'both')
    .sort((a, b) => a.joinedAt - b.joinedAt); // Longest waiting first

  if (candidates.length === 0) {
    return { status: 'waiting' };
  }

  const partner = candidates[0];

  // Remove both from queue
  await leaveQueue(userId);
  await leaveQueue(partner.userId);

  // Generate shared roomId and matchId
  const roomId = `random_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const matchId = new mongoose.Types.ObjectId().toString();

  const appIdStr = process.env.ZEGO_APP_ID || '123456';
  const appId = parseInt(appIdStr, 10);
  const serverSecret = process.env.ZEGO_SERVER_SECRET || '12345678901234567890123456789012';

  // Generate tokens for both
  const tokenA = generateZegoToken(appId, userId, serverSecret, 1800, JSON.stringify({ room_id: roomId }));
  const tokenB = generateZegoToken(appId, partner.userId, serverSecret, 1800, JSON.stringify({ room_id: roomId }));

  // Save match to DB
  await RandomMatch.create({
    _id: matchId,
    userA: new mongoose.Types.ObjectId(userId),
    userB: new mongoose.Types.ObjectId(partner.userId),
    roomId,
    mode,
    status: 'matched',
    startedAt: new Date(),
  });

  // Emit match:found event to both via Socket.io
  const io = getIO();
  if (io) {
    // Notify A (current user)
    io.of('/adult').to(`user:${userId}`).emit('random:match_found', {
      matchId,
      roomId,
      token: tokenA,
      appId,
      partnerId: partner.userId,
    });

    // Notify B (partner)
    io.of('/adult').to(`user:${partner.userId}`).emit('random:match_found', {
      matchId,
      roomId,
      token: tokenB,
      appId,
      partnerId: userId,
    });
  }

  return {
    status: 'matched',
    matchId,
    roomId,
    token: tokenA,
    appId,
    partnerId: partner.userId,
  };
};

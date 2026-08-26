import Redis from 'ioredis';
import { RandomMatch } from '../models/RandomMatch';
import AdultUser from '../models/AdultUser';
import { generateAgoraToken } from './agora.service';
import mongoose from 'mongoose';
import { getIO } from '../socket';

export type GenderPreference = 'girls' | 'guys' | 'anyone';
export type ConnectionMode = 'text' | 'video' | 'both';

export interface QueueUser {
  userId: string;
  gender: 'male' | 'female' | 'other';
  preference: GenderPreference;
  mode: ConnectionMode;
  joinedAt: number;
}

let redisClient: Redis | null = null;
if (process.env.NODE_ENV !== 'test' && (process.env.REDIS_URL || process.env.REDIS_HOST)) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '', { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  } catch (err) {
    console.warn('Failed to initialize Redis client for matching queue, using memory fallback:', err);
  }
}

// In-Memory Fallback Queue store & exclusions
const memoryQueue = new Map<string, QueueUser>();
const exclusionMap = new Map<string, number>(); // `${userA}_${userB}` -> expiresAt timestamp

const QUEUE_KEY = 'adult:random:queue';
let isMatchingInProgress = false;

export const addExclusion = (userA: string, userB: string, durationMs: number = 60000) => {
  const expiresAt = Date.now() + durationMs;
  exclusionMap.set(`${userA}_${userB}`, expiresAt);
  exclusionMap.set(`${userB}_${userA}`, expiresAt);
};

export const isExcluded = (userA: string, userB: string): boolean => {
  const now = Date.now();
  const key1 = `${userA}_${userB}`;
  const exp1 = exclusionMap.get(key1);
  if (exp1) {
    if (exp1 > now) return true;
    exclusionMap.delete(key1);
  }
  const key2 = `${userB}_${userA}`;
  const exp2 = exclusionMap.get(key2);
  if (exp2) {
    if (exp2 > now) return true;
    exclusionMap.delete(key2);
  }
  return false;
};

export const isRandomMatchCompatible = (user1: QueueUser, user2: QueueUser): boolean => {
  if (user1.userId === user2.userId) return false;

  // 1. Exclusion check
  if (isExcluded(user1.userId, user2.userId)) return false;

  // 2. Symmetric Gender Preference Check
  if (user1.preference === 'girls' && user2.gender !== 'female') return false;
  if (user1.preference === 'guys' && user2.gender !== 'male') return false;

  if (user2.preference === 'girls' && user1.gender !== 'female') return false;
  if (user2.preference === 'guys' && user1.gender !== 'male') return false;

  // 3. Mode Compatibility Matrix
  // text <-> text, video <-> video, both <-> any
  if (user1.mode === 'text' && user2.mode === 'video') return false;
  if (user1.mode === 'video' && user2.mode === 'text') return false;

  return true;
};

export const joinQueue = async (
  userId: string,
  preference: GenderPreference = 'anyone',
  mode: ConnectionMode = 'both'
): Promise<any> => {
  // Check active match invariant first
  const activeMatch = await RandomMatch.findOne({
    $or: [{ userA: userId }, { userB: userId }],
    status: 'matched',
  }).lean();

  if (activeMatch) {
    const isUserA = activeMatch.userA.toString() === userId;
    const partnerId = isUserA ? activeMatch.userB.toString() : activeMatch.userA.toString();
    const appId = process.env.AGORA_APP_ID || '123456';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '12345678901234567890123456789012';
    const token = generateAgoraToken(appId, appCertificate, activeMatch.roomId, userId, 'publisher', 1800);

    return {
      status: 'matched',
      matchId: activeMatch._id.toString(),
      roomId: activeMatch.roomId,
      token,
      appId,
      partnerId,
      mode: activeMatch.mode,
    };
  }

  // Fetch actual user gender from AdultUser database record
  const dbUser = await AdultUser.findById(userId).select('gender providerProfile').lean();
  let userGender: 'male' | 'female' | 'other' = 'female';
  if (dbUser?.gender === 'male' || dbUser?.providerProfile?.gender === 'male') {
    userGender = 'male';
  } else if (dbUser?.gender === 'female' || dbUser?.providerProfile?.gender === 'female') {
    userGender = 'female';
  }

  const entry: QueueUser = {
    userId,
    gender: userGender,
    preference,
    mode,
    joinedAt: Date.now(),
  };

  if (redisClient) {
    try {
      await redisClient.hset(QUEUE_KEY, userId, JSON.stringify(entry));
    } catch (err) {
      console.warn('Redis queue write failed, falling back to memory queue:', err);
      memoryQueue.set(userId, entry);
    }
  } else {
    memoryQueue.set(userId, entry);
  }

  return tryMatch(userId);
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

export const tryMatch = async (requesterId: string): Promise<any> => {
  if (isMatchingInProgress) {
    return { status: 'waiting' };
  }
  isMatchingInProgress = true;

  try {
    let allWaiting: QueueUser[] = [];

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

    const requester = allWaiting.find((u) => u.userId === requesterId);
    if (!requester) {
      return { status: 'waiting' };
    }

    // Filter compatible candidates sorted by longest waiting
    const candidates = allWaiting
      .filter((u) => u.userId !== requesterId)
      .filter((u) => isRandomMatchCompatible(requester, u))
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (candidates.length === 0) {
      return { status: 'waiting' };
    }

    const partner = candidates[0];

    // Remove both participants from queue atomically
    await leaveQueue(requester.userId);
    await leaveQueue(partner.userId);

    const roomId = `random_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const matchId = new mongoose.Types.ObjectId().toString();

    // Determine derived operational session mode
    let sessionMode: ConnectionMode = 'video';
    if (requester.mode === 'text' || partner.mode === 'text') {
      sessionMode = 'text';
    } else if (requester.mode === 'both' || partner.mode === 'both') {
      sessionMode = 'both';
    }

    const appId = process.env.AGORA_APP_ID || '123456';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '12345678901234567890123456789012';

    const tokenA = generateAgoraToken(appId, appCertificate, roomId, requester.userId, 'publisher', 1800);
    const tokenB = generateAgoraToken(appId, appCertificate, roomId, partner.userId, 'publisher', 1800);

    await RandomMatch.create({
      _id: matchId,
      userA: new mongoose.Types.ObjectId(requester.userId),
      userB: new mongoose.Types.ObjectId(partner.userId),
      roomId,
      mode: sessionMode,
      preferenceA: requester.preference,
      preferenceB: partner.preference,
      status: 'matched',
      startedAt: new Date(),
    });

    const io = getIO();
    if (io) {
      io.of('/adult').to(`user:${requester.userId}`).emit('random:match_found', {
        matchId,
        roomId,
        token: tokenA,
        appId,
        partnerId: partner.userId,
        mode: sessionMode,
      });

      io.of('/adult').to(`user:${partner.userId}`).emit('random:match_found', {
        matchId,
        roomId,
        token: tokenB,
        appId,
        partnerId: requester.userId,
        mode: sessionMode,
      });
    }

    return {
      status: 'matched',
      matchId,
      roomId,
      token: tokenA,
      appId,
      partnerId: partner.userId,
      mode: sessionMode,
    };
  } finally {
    isMatchingInProgress = false;
  }
};

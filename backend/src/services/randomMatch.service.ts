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

export const addExclusion = async (userA: string, userB: string, durationMs: number = 60000) => {
  const ttlSec = Math.ceil(durationMs / 1000);
  if (redisClient) {
    try {
      await redisClient.set(`adult:random:exclude:${userA}:${userB}`, '1', 'EX', ttlSec);
      await redisClient.set(`adult:random:exclude:${userB}:${userA}`, '1', 'EX', ttlSec);
      return;
    } catch (err) {
      console.warn('Redis exclusion set failed, falling back to memory:', err);
    }
  }
  const expiresAt = Date.now() + durationMs;
  exclusionMap.set(`${userA}_${userB}`, expiresAt);
  exclusionMap.set(`${userB}_${userA}`, expiresAt);
};

export const isExcluded = async (userA: string, userB: string): Promise<boolean> => {
  if (redisClient) {
    try {
      const ex1 = await redisClient.get(`adult:random:exclude:${userA}:${userB}`);
      if (ex1) return true;
      const ex2 = await redisClient.get(`adult:random:exclude:${userB}:${userA}`);
      if (ex2) return true;
      return false;
    } catch (err) {
      console.warn('Redis exclusion get failed, falling back to memory:', err);
    }
  }
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

export const isRandomMatchCompatible = async (user1: QueueUser, user2: QueueUser): Promise<boolean> => {
  if (user1.userId === user2.userId) return false;

  // 1. Exclusion check
  if (await isExcluded(user1.userId, user2.userId)) return false;

  // 2. Active match check (database authority)
  const validIds = [user1.userId, user2.userId].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length > 0) {
    const hasActiveMatch = await RandomMatch.exists({
      $or: [
        { userA: { $in: validIds } },
        { userB: { $in: validIds } },
      ],
      status: 'matched',
    });
    if (hasActiveMatch) return false;
  }

  // 3. Symmetric Gender Preference Check
  if (user1.preference === 'girls' && user2.gender !== 'female') return false;
  if (user1.preference === 'guys' && user2.gender !== 'male') return false;

  if (user2.preference === 'girls' && user1.gender !== 'female') return false;
  if (user2.preference === 'guys' && user1.gender !== 'male') return false;

  // 4. Mode Compatibility Matrix
  // text <-> text, video <-> video, both <-> any mode
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
  let userGender: 'male' | 'female' | 'other' = 'other';
  if (dbUser?.gender === 'male' || dbUser?.providerProfile?.gender === 'male') {
    userGender = 'male';
  } else if (dbUser?.gender === 'female' || dbUser?.providerProfile?.gender === 'female') {
    userGender = 'female';
  } else if (dbUser?.gender === 'other' || dbUser?.providerProfile?.gender === 'other') {
    userGender = 'other';
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
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('Matching service is temporarily unavailable. Please try again.');
      }
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
  let lockAcquired = false;
  let lockHeartbeat: NodeJS.Timeout | null = null;
  const lockKey = 'adult:random:lock';
  const lockVal = `${requesterId}_${Date.now()}`;

  if (redisClient) {
    try {
      const res = await redisClient.set(lockKey, lockVal, 'PX', 15000, 'NX');
      if (res === 'OK') {
        lockAcquired = true;
        // Periodic lock extension every 5 seconds while match processing continues
        lockHeartbeat = setInterval(async () => {
          if (!redisClient) return;
          try {
            const currentVal = await redisClient.get(lockKey);
            if (currentVal === lockVal) {
              await redisClient.pexpire(lockKey, 15000);
            }
          } catch (renewErr) {
            console.warn('Lock heartbeat renewal error:', renewErr);
          }
        }, 5000);
      } else {
        return { status: 'waiting' };
      }
    } catch (err) {
      console.warn('Redis lock acquire failed, falling back to process lock:', err);
      if (isMatchingInProgress) return { status: 'waiting' };
      isMatchingInProgress = true;
      lockAcquired = true;
    }
  } else {
    if (isMatchingInProgress) return { status: 'waiting' };
    isMatchingInProgress = true;
    lockAcquired = true;
  }

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
    const candidatePromises = allWaiting
      .filter((u) => u.userId !== requesterId)
      .map(async (u) => ((await isRandomMatchCompatible(requester, u)) ? u : null));

    const candidateResults = await Promise.all(candidatePromises);
    let candidates = candidateResults
      .filter((u): u is QueueUser => u !== null)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (candidates.length === 0) {
      return { status: 'waiting' };
    }

    // Exclude any candidates who already have an active RandomMatch document in DB
    const candidateUserIds = candidates.map((c) => c.userId);
    const activeMatches = await RandomMatch.find({
      $or: [{ userA: { $in: candidateUserIds } }, { userB: { $in: candidateUserIds } }],
      status: 'matched',
    }).select('userA userB').lean();

    const activeUserSet = new Set<string>();
    for (const m of activeMatches) {
      activeUserSet.add(m.userA.toString());
      activeUserSet.add(m.userB.toString());
    }

    // Purge stale candidates from queue if found active elsewhere
    for (const activeUid of activeUserSet) {
      void leaveQueue(activeUid);
    }

    candidates = candidates.filter((c) => !activeUserSet.has(c.userId));

    if (candidates.length === 0) {
      return { status: 'waiting' };
    }

    const partner = candidates[0];

    // Double-check active match invariant for both requester and partner before creating match
    const existingMatchCheck = await RandomMatch.exists({
      $or: [{ userA: requester.userId }, { userB: requester.userId }, { userA: partner.userId }, { userB: partner.userId }],
      status: 'matched',
    });

    if (existingMatchCheck) {
      return { status: 'waiting' };
    }

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

    try {
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
    } catch (createErr) {
      console.error('Failed to create RandomMatch session document:', createErr);
      // Leave users in queue untouched on creation failure (do not recursively re-queue)
      throw createErr;
    }

    // Queue removal occurs only AFTER successful RandomMatch creation
    await leaveQueue(requester.userId);
    await leaveQueue(partner.userId);

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
    if (lockHeartbeat) {
      clearInterval(lockHeartbeat);
    }
    if (redisClient && lockAcquired) {
      try {
        const currentLockVal = await redisClient.get(lockKey);
        if (currentLockVal === lockVal) {
          await redisClient.del(lockKey);
        }
      } catch (err) {
        console.warn('Redis lock release failed:', err);
      }
    }
    isMatchingInProgress = false;
  }
};

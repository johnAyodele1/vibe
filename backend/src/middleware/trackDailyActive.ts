import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

let redisClient: Redis | null = null;
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '');
  } catch (err) {}
}

const memoryDAU = new Map<string, Set<string>>();

export const trackDailyActive = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).adultUser?._id?.toString() || (req as any).user?._id?.toString();
  const today  = new Date().toISOString().slice(0, 10);  // "2026-07-28"

  if (userId) {
    if (redisClient) {
      try {
        // Add user to today's set — O(1), automatically unique
        await redisClient.sadd(`adult:dau:${today}`, userId);
        // Expire after 7 days (we only need recent data in Redis)
        await redisClient.expire(`adult:dau:${today}`, 7 * 24 * 60 * 60);
      } catch (err) {
        console.error('trackDailyActive redis error:', err);
      }
    } else {
      if (!memoryDAU.has(today)) {
        memoryDAU.set(today, new Set());
      }
      memoryDAU.get(today)!.add(userId);
    }
  }

  next();
};

export const getDauCount = async (date: string): Promise<number> => {
  if (redisClient) {
    try {
      return await redisClient.scard(`adult:dau:${date}`);
    } catch (err) {
      console.error('getDauCount redis error:', err);
    }
  }
  return memoryDAU.get(date)?.size || 0;
};

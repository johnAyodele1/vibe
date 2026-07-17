import Redis from 'ioredis';

let redisClient: Redis | null = null;

if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '');
  } catch (err) {
    console.warn('Failed to initialize Redis client, falling back to in-memory cache:', err);
  }
}

const memoryCache = new Map<string, { value: any; expiresAt: number }>();

export const getCache = async (key: string): Promise<any | null> => {
  if (redisClient) {
    try {
      const val = await redisClient.get(key);
      if (val) return JSON.parse(val);
    } catch (err) {
      console.warn('Redis read error:', err);
    }
  }

  const cached = memoryCache.get(key);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.value;
    }
    memoryCache.delete(key);
  }
  return null;
};

export const setCache = async (key: string, ttlSeconds: number, value: any): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch (err) {
      console.warn('Redis write error:', err);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

export default { getCache, setCache };

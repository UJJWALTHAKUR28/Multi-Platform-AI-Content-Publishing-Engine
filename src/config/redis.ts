import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.REDIS_URL!;
export const redis = new Redis(url, {
  tls: url.startsWith('rediss://') ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});
redis.on('error', err => console.error('Redis error:', err.message));
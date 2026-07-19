import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.REDIS_URL;

// Redis is optional - only connect if REDIS_URL is provided
export const redis = url ? new Redis(url, {
  tls: url.startsWith('rediss://') ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
}) : null;

if (redis) {
  redis.on('error', err => console.error('Redis error:', err.message));
}


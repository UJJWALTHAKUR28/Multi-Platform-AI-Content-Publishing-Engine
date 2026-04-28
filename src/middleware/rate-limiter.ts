import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { ApiError } from "../utils/api-error";
interface RateLimitPreset {
  windowSeconds: number;
  maxHits: number;
  keyPrefix: string;
}
const PRESETS: Record<string, RateLimitPreset> = {
  register: { windowSeconds: 3600, maxHits: 5, keyPrefix: "rl:register" },
  login: { windowSeconds: 900, maxHits: 10, keyPrefix: "rl:login" },
  refresh: { windowSeconds: 60, maxHits: 10, keyPrefix: "rl:refresh" },
  forgotPassword: { windowSeconds: 3600, maxHits: 3, keyPrefix: "rl:forgot" },
  verifyEmail: { windowSeconds: 3600, maxHits: 5, keyPrefix: "rl:verify" },
  resendVerification: { windowSeconds: 3600, maxHits: 3, keyPrefix: "rl:resend" },
  general: { windowSeconds: 60, maxHits: 100, keyPrefix: "rl:general" },
};
export function rateLimiter(presetName: keyof typeof PRESETS) {
  const preset = PRESETS[presetName];

  if (!preset) {
    throw new Error(`Unknown rate-limit preset: "${String(presetName)}"`);
  }
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = extractIdentifier(req, presetName);
      const key = `${preset.keyPrefix}:${identifier}`;
      const now = Date.now();
      const windowStart = now - preset.windowSeconds * 1000;
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}:${Math.random()}`);
      pipeline.expire(key, preset.windowSeconds);
      const results = await pipeline.exec();
      const hitCount = (results?.[1]?.[1] as number) ?? 0;
      if (hitCount >= preset.maxHits) {
        throw ApiError.tooManyRequests(
          `Rate limit exceeded. Try again in ${preset.windowSeconds} seconds.`,
        );
      }
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      console.error("Rate limiter error:", error);
      next();
    }
  };
}
function extractIdentifier(req: Request, preset: string): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]?.trim()) ||
    req.ip ||
    "unknown";

  if (preset === "forgotPassword" && req.body?.email) {
    return `${ip}:${req.body.email}`;
  }

  return ip;
}

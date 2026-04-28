import bcrypt from "bcrypt";
import { env } from "../config/env";

/**
 * BCRYPT_COST is loaded from env and validated to be ≥ 12.
 * We read it once so a misconfiguration can never silently
 * downgrade the work factor at runtime.
 */
const BCRYPT_MIN_COST = 12;
const cost = Math.max(env.BCRYPT_COST, BCRYPT_MIN_COST);

/**
 * Hash a plaintext password with bcrypt.
 * Cost factor is guaranteed ≥ 12 — never lower.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, cost);
}

/**
 * Constant-time comparison of a plaintext password against
 * a bcrypt hash.  Returns `true` on match.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

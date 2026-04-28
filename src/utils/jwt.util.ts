import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { env } from "../config/env";
export interface AccessTokenPayload {
  sub: string;      // userId
  email: string;
  username: string;
  type: "access";
}
export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_EXPIRY as any,
  };

  return jwt.sign(
    { ...payload, type: "access" } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    options,
  );
}
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }

  return decoded;
}
const BCRYPT_COST = Math.max(env.BCRYPT_COST, 12);
export async function signRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = await bcrypt.hash(raw, BCRYPT_COST);
  return { raw, hash };
}
export async function verifyRefreshToken(
  raw: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}

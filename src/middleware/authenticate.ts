import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.util";
import { prisma } from "../db/prisma";
import { ApiError } from "../utils/api-error";
export async function authenticate(req: Request, _res: Response, next: NextFunction,): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing or malformed Authorization header");
    }
    const token = header.slice(7);

    if (!token) {
      throw ApiError.unauthorized("Token not provided");
    }
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized("Invalid or expired access token");
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
        emailverified: true,
      },
    });

    if (!user) {
      throw ApiError.unauthorized("User no longer exists");
    }
    if (!user.isActive) {
      throw ApiError.forbidden("Account has been suspended");
    }
    if (!user.emailverified) {
      throw ApiError.forbidden(
        "Email not verified. Please verify your email before accessing this resource.",
      );
    }
    req.user = { id: user.id, email: user.email, username: user.username, };
    next();
  } catch (error) {
    next(error);
  }
}

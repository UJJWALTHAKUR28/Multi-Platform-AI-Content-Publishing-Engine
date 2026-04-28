import type { Request, Response, NextFunction, CookieOptions } from "express";
import { sendSuccess } from "../../utils/api-response";
import { extractRequestMeta } from "../../utils/request-meta.util";
import { ApiError } from "../../utils/api-error";
import * as authService from "../../services/auth.service";
import { env } from "../../config/env";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
  ChangePasswordInput,
} from "./auth.schema";

const REFRESH_TOKEN_COOKIE = "refreshToken";

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
};
async function register(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as RegisterInput;
    const meta = extractRequestMeta(req);
    const result = await authService.register(body, meta);
    sendSuccess(res, result, 201);
  } catch (error) {
    next(error);
  }
}
async function login(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as LoginInput;
    const meta = extractRequestMeta(req);
    const { accessToken, refreshToken, user } = await authService.login(body, meta);

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { accessToken, user });
  } catch (error) {
    next(error);
  }
}
async function refresh(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    console.log("DEBUG: All cookies in request:", req.cookies);
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw ApiError.unauthorized("Refresh token not found in cookies");
    }
    const meta = extractRequestMeta(req);
    const { accessToken, refreshToken: newRefreshToken } = await authService.refreshAccessToken(refreshToken, meta);

    res.cookie(REFRESH_TOKEN_COOKIE, newRefreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { accessToken });
  } catch (error) {
    next(error);
  }
}
async function logoutHandler(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw ApiError.unauthorized("Refresh token not found in cookies");
    }
    const meta = extractRequestMeta(req);
    await authService.logout(refreshToken, req.user!.id, meta);

    res.clearCookie(REFRESH_TOKEN_COOKIE, { ...COOKIE_OPTIONS, maxAge: 0 });
    sendSuccess(res, { message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
}
async function logoutAll(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const meta = extractRequestMeta(req);
    await authService.logoutAllDevices(req.user!.id, meta);
    sendSuccess(res, { message: "Logged out from all devices" });
  } catch (error) {
    next(error);
  }
}
async function forgotPassword(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const { email } = req.body as ForgotPasswordInput;
    const meta = extractRequestMeta(req);
    const result = await authService.forgotPassword(email, meta);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function resetPassword(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const { token, password } = req.body as ResetPasswordInput;
    const result = await authService.resetPassword(token, password);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function verifyEmailHandler(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const token = (req.body as VerifyEmailInput)?.token || (req.query.token as string);
    if (!token) {
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Verification token is required" },
      });
      return;
    }
    const result = await authService.verifyEmail(token);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function resendVerification(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const result = await authService.resendVerificationEmail(req.user!.id);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function changePassword(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as ChangePasswordInput;
    const meta = extractRequestMeta(req);
    const result = await authService.changePassword(req.user!.id, body, meta);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function getProfile(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const result = await authService.getProfile(req.user!.id);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
export default { register, login, refresh, logout: logoutHandler, logoutAll, forgotPassword, resetPassword, verifyEmail: verifyEmailHandler, resendVerification, changePassword, getProfile, };
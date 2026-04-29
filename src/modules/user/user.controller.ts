import type { Request, Response, NextFunction, CookieOptions } from "express";
import { sendSuccess } from "../../utils/api-response";
import { extractRequestMeta } from "../../utils/request-meta.util";
import { ApiError } from "../../utils/api-error";
import * as userService from "../../services/user.service";
import { env } from "../../config/env";
import type { UpdateProfileInput, AddSocialAccountInput, AddApikeysInput, } from "./user.schema";
async function getProfile(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const profile = await userService.getProfile(req.user!.id);
    sendSuccess(res, profile);
  } catch (error) {
    next(error);
  }
}
async function updateProfile(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as UpdateProfileInput;
    const meta = extractRequestMeta(req);
    const profile = await userService.updateProfile(req.user!.id, body, meta);
    sendSuccess(res, profile);
  } catch (error) {
    next(error);
  }
}
async function addSocialaccount(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as AddSocialAccountInput;
    const meta = extractRequestMeta(req);
    const account = await userService.addSocialAccount(
      req.user!.id,
      body,
      meta,
    );
    sendSuccess(res, account, 201);
  } catch (error) {
    next(error);
  }
}

async function getAllsocialaccount(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const accounts = await userService.getAllSocialAccounts(req.user!.id);
    sendSuccess(res, accounts);
  } catch (error) {
    next(error);
  }
}
async function disconnectsocialaccount(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const meta = extractRequestMeta(req);
    const result = await userService.disconnectSocialAccount(
      req.user!.id,
      req.params.id as string,
      meta,
    );
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
async function oauthRedirect(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const platform = req.params.platform as string;
    if (!userService.isValidPlatform(platform)) {
      throw ApiError.badRequest(
        `Unsupported platform: ${platform}. Supported: Twitter, Linkedin, Instagram, Threads`,
      );
    }
    const { url, state } = userService.initiateOAuth(platform);
    res.cookie(`oauth_state_${platform}`, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });
    // Return the URL as JSON instead of redirecting directly.
    // The frontend (or Postman) will take this URL and open it in the browser.
    sendSuccess(res, { redirectUrl: url });
  } catch (error) {
    next(error);
  }
}
async function oauthCallback(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const platform = req.params.platform as string;
    if (!userService.isValidPlatform(platform)) {
      throw ApiError.badRequest(`Unsupported platform: ${platform}`);
    }
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    if (oauthError) {
      throw ApiError.badRequest(`OAuth error from ${platform}: ${oauthError}`);
    }
    if (!code) {
      throw ApiError.badRequest("Missing authorization code from OAuth callback");
    }
    const storedState = req.cookies[`oauth_state_${platform}`];
    res.clearCookie(`oauth_state_${platform}`);
    const meta = extractRequestMeta(req);
    const account = await userService.handleOAuthCallback(
      req.user!.id,
      platform,
      code,
      storedState,
      state,
      meta,
    );
    sendSuccess(res, account, 201);
  } catch (error) {
    next(error);
  }
}
async function addAIapikeys(req: Request, res: Response, next: NextFunction,): Promise<void> {
  try {
    const body = req.body as AddApikeysInput;
    const meta = extractRequestMeta(req);
    const keys = await userService.upsertAIKeys(req.user!.id, body, meta);
    sendSuccess(res, keys);
  } catch (error) {
    next(error);
  }
}
export default { getProfile, updateProfile, addSocialaccount, getAllsocialaccount, disconnectsocialaccount, oauthRedirect, oauthCallback, addAIapikeys, };

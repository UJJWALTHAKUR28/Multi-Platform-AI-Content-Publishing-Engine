import { prisma } from "../db/prisma";
import { encrypt, decrypt, maskSecret } from "../utils/encryption.util";
import { createAuditLog } from "./audit.service";
import { ApiError } from "../utils/api-error";
import type { UpdateProfileInput, AddSocialAccountInput, AddApikeysInput } from "../modules/user/user.schema";

/* ─────────────── Safe select fields ─────────────── */

const SAFE_SELECT = {
  id: true,
  email: true,
  username: true,
  timezone: true,
  isActive: true,
  emailverified: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PROFILE_SELECT = {
  id: true,
  email: true,
  username: true,
  bio: true,
  defaultTone: true,
  defaultLanguage: true,
  timezone: true,
  telegramChatId: true,
  whatsappNo: true,
  isActive: true,
  emailverified: true,
  createdAt: true,
  updatedAt: true,
} as const;
export async function findById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: SAFE_SELECT,
  });
}
export async function findByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: SAFE_SELECT,
  });
}
export async function findByEmailWithPassword(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      ...SAFE_SELECT,
      password: true,
    },
  });
}
export async function updateUser(
  id: string,
  data: {
    password?: string;
    emailverified?: boolean;
    isActive?: boolean;
    username?: string;
    timezone?: string;
  },
) {
  return prisma.user.update({
    where: { id },
    data,
    select: SAFE_SELECT,
  });
}
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT,
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      username: data.username,
      bio: data.bio,
      defaultTone: data.defaultTone,
      defaultLanguage: data.defaultLanguage,
      timezone: data.timezone,
      telegramChatId: data.telegramChatId,
      whatsappNo: data.whatsappNo,
    },
    select: PROFILE_SELECT,
  });

  await createAuditLog({
    userId,
    action: "PROFILE_UPDATED",
    resource: "User",
    resourceId: userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { updatedFields: Object.keys(data) },
  });

  return user;
}
export async function addSocialAccount(
  userId: string,
  data: AddSocialAccountInput,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform: data.platform } },
  });
  if (existing) {
    throw ApiError.conflict(
      `You already have a ${data.platform} account linked. Disconnect it first.`,
    );
  }
  const encryptedAccessToken = encrypt(data.accessToken);
  const encryptedPlatformUserId = encrypt(data.platformUserId);
  const encryptedRefreshToken = data.refreshToken
    ? encrypt(data.refreshToken)
    : null;

  const account = await prisma.socialAccount.create({
    data: {
      userId,
      platform: data.platform,
      platformUserId: encryptedPlatformUserId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      scope: data.scope ?? null,
      handle: data.handle,
      linkMethod: data.linkMethod ?? "manual",
    },
    select: {
      id: true,
      platform: true,
      handle: true,
      linkMethod: true,
      connectedAt: true,
    },
  });

  await createAuditLog({
    userId,
    action: "SOCIAL_ACCOUNT_CONNECTED",
    resource: "SocialAccount",
    resourceId: account.id,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { platform: data.platform, linkMethod: data.linkMethod ?? "manual" },
  });

  return account;
}

export async function getAllSocialAccounts(userId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      scope: true,
      handle: true,
      linkMethod: true,
      connectedAt: true,
      updatedAt: true,
    },
    orderBy: { connectedAt: "desc" },
  });
  return accounts.map((acc) => ({
    id: acc.id,
    platform: acc.platform,
    platformUserId: maskSecret(decrypt(acc.platformUserId)),
    accessToken: maskSecret(decrypt(acc.accessToken)),
    refreshToken: acc.refreshToken
      ? maskSecret(decrypt(acc.refreshToken))
      : null,
    tokenExpiresAt: acc.tokenExpiresAt,
    scope: acc.scope,
    handle: acc.handle,
    linkMethod: acc.linkMethod,
    connectedAt: acc.connectedAt,
    updatedAt: acc.updatedAt,
  }));
}

export async function disconnectSocialAccount(
  userId: string,
  accountId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, platform: true },
  });

  if (!account) throw ApiError.notFound("Social account not found");
  if (account.userId !== userId) {
    throw ApiError.forbidden("You do not own this social account");
  }

  await prisma.socialAccount.delete({ where: { id: accountId } });

  await createAuditLog({
    userId,
    action: "SOCIAL_ACCOUNT_DISCONNECTED",
    resource: "SocialAccount",
    resourceId: accountId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { platform: account.platform },
  });

  return { message: `${account.platform} account disconnected successfully` };
}
export async function upsertAIKeys(
  userId: string,
  data: AddApikeysInput,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const encData: Record<string, unknown> = {};
  if (data.openAiKey) encData.openaiKey = encrypt(data.openAiKey);
  if (data.anthropicKey) encData.anthropicKey = encrypt(data.anthropicKey);
  if (data.geminiKey) encData.geminiKey = encrypt(data.geminiKey);
  if (data.aiModel) encData.defaultAIModel = data.aiModel;
  const keys = await prisma.aIKey.upsert({
    where: { userId },
    create: {
      userId,
      ...encData,
    },
    update: encData,
    select: {
      id: true,
      openaiKey: true,
      anthropicKey: true,
      geminiKey: true,
      defaultAIModel: true,
      updatedAt: true,
    },
  });
  await createAuditLog({
    userId,
    action: "AI_KEY_UPDATED",
    resource: "AIKey",
    resourceId: keys.id,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: {
      updatedKeys: [
        data.openAiKey ? "openai" : null,
        data.anthropicKey ? "anthropic" : null,
        data.geminiKey ? "gemini" : null,
      ].filter(Boolean),
    },
  });
  return {
    id: keys.id,
    openaiKey: keys.openaiKey ? maskSecret(decrypt(keys.openaiKey)) : null,
    anthropicKey: keys.anthropicKey
      ? maskSecret(decrypt(keys.anthropicKey))
      : null,
    geminiKey: keys.geminiKey ? maskSecret(decrypt(keys.geminiKey)) : null,
    defaultAIModel: keys.defaultAIModel,
    updatedAt: keys.updatedAt,
  };
}
import { getOAuthRedirectUrl, exchangeOAuthCode, type OAuthPlatform } from "../utils/oauth.util";
import { env } from "../config/env";

const VALID_PLATFORMS = ["Twitter", "Linkedin", "Instagram", "Threads"] as const;

export function isValidPlatform(p: string): p is OAuthPlatform {
  return (VALID_PLATFORMS as readonly string[]).includes(p);
}
export function initiateOAuth(platform: OAuthPlatform) {
  const callbackBase = env.OAUTH_CALLBACK_BASE_URL || env.APP_URL;
  const callbackUrl = `${callbackBase}/api/user/social-accounts/oauth/${platform}/callback`;
  const { url, state } = getOAuthRedirectUrl(platform, callbackUrl);
  return { url, state, callbackUrl };
}
export async function handleOAuthCallback(
  userId: string,
  platform: OAuthPlatform,
  code: string,
  storedState: string | undefined,
  incomingState: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  if (!storedState || storedState !== incomingState) {
    throw ApiError.badRequest("Invalid OAuth state — possible CSRF attack");
  }
  const callbackBase = env.OAUTH_CALLBACK_BASE_URL || env.APP_URL;
  const callbackUrl = `${callbackBase}/api/user/social-accounts/oauth/${platform}/callback`;
  const tokens = await exchangeOAuthCode(platform, code, callbackUrl);
  const existing = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (existing) {
    throw ApiError.conflict(
      `You already have a ${platform} account linked. Disconnect it first.`,
    );
  }
  const account = await prisma.socialAccount.create({
    data: {
      userId,
      platform,
      platformUserId: encrypt(tokens.platformUserId),
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
      handle: tokens.handle,
      linkMethod: "oauth",
    },
    select: {
      id: true,
      platform: true,
      handle: true,
      linkMethod: true,
      connectedAt: true,
    },
  });

  await createAuditLog({
    userId,
    action: "SOCIAL_ACCOUNT_CONNECTED",
    resource: "SocialAccount",
    resourceId: account.id,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { platform, linkMethod: "oauth" },
  });

  return account;
}


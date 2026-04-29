import crypto from "crypto";
import { env } from "../config/env";
export type OAuthPlatform = "Twitter" | "Linkedin" | "Instagram" | "Threads";
export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  platformUserId: string;
  handle: string;
  scope?: string;
}
interface PlatformOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}
function getPlatformConfig(platform: OAuthPlatform): PlatformOAuthConfig {
  const callbackBase = env.OAUTH_CALLBACK_BASE_URL || env.APP_URL;
  switch (platform) {
    case "Twitter":
      return {
        authorizeUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        clientId: env.TWITTER_CLIENT_ID,
        clientSecret: env.TWITTER_CLIENT_SECRET,
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      };
    case "Linkedin":
      return {
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        scopes: ["openid", "profile", "w_member_social"],
      };
    case "Instagram":
      return {
        authorizeUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        clientId: env.INSTAGRAM_CLIENT_ID,
        clientSecret: env.INSTAGRAM_CLIENT_SECRET,
        scopes: ["instagram_basic", "instagram_content_publish"],
      };
    case "Threads":
      return {
        authorizeUrl: "https://www.threads.net/oauth/authorize",
        tokenUrl: "https://graph.threads.net/oauth/access_token",
        clientId: env.THREADS_CLIENT_ID,
        clientSecret: env.THREADS_CLIENT_SECRET,
        scopes: ["threads_basic", "threads_content_publish"],
      };
  }
}
export function getOAuthRedirectUrl(
  platform: OAuthPlatform,
  callbackUrl: string,
): { url: string; state: string } {
  const config = getPlatformConfig(platform);
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });
  if (platform === "Twitter") {
    params.set("code_challenge", "challenge");
    params.set("code_challenge_method", "plain");
  }

  return { url: `${config.authorizeUrl}?${params.toString()}`, state };
}
export async function exchangeOAuthCode(
  platform: OAuthPlatform,
  code: string,
  callbackUrl: string,
): Promise<OAuthTokenResult> {
  const config = getPlatformConfig(platform);
   const response = await fetch(config.tokenUrl, {
     method: "POST",
     headers: { "Content-Type": "application/x-www-form-urlencoded" },
     body: new URLSearchParams({
       grant_type: "authorization_code",
       code,
       redirect_uri: callbackUrl,
       client_id: config.clientId,
       client_secret: config.clientSecret,
     }),
   });
  const data = await response.json();
  throw new Error(
    `OAuth code exchange for ${platform} is not yet implemented. ` +
      `Please link your account manually or implement the token exchange.`,
  );
}


import { prisma } from '../../db/prisma';
import { decrypt } from '../../utils/encryption.util';
import { ApiError } from '../../utils/api-error';
interface PublisherInput {
  userId: string;
  content: string;
  hashtags: string[];
  platform: string;
}
interface PublisherResult {
  platformPostId: string | null;
}
interface GraphApiError {
  message?: string;
  type?: string;
  code?: number;
}
interface ContainerResponse {
  id?: string;
  error?: GraphApiError;
}

interface PublishResponse {
  id?: string;
  error?: GraphApiError;
}
export const instagramPublisher = async (
  input: PublisherInput
): Promise<PublisherResult> => {
  const account = await prisma.socialAccount.findUnique({
    where: {
      userId_platform: {
        userId:   input.userId,
        platform: 'Instagram',
      },
    },
    select: {
      accessToken:    true,
      platformUserId: true,
      tokenExpiresAt: true,
      handle:         true,
    },
  });
  if (!account) {
    throw new ApiError(
      400,
      'ACCOUNT_NOT_CONNECTED',
      'Instagram account not connected. Link it first in Settings.'
    );
  }
  if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    throw new ApiError(
      401,
      'TOKEN_EXPIRED',
      `Instagram token expired for @${account.handle}. Reconnect your account.`
    );
  }
  const accessToken = decrypt(account.accessToken);
  const igUserId    = account.platformUserId;
  const hashtagStr = input.hashtags
    .map(h => h.startsWith('#') ? h : `#${h}`)
    .join(' ');
  const caption = `${input.content}\n\n${hashtagStr}`.trim();

  const baseUrl = `https://graph.facebook.com/v18.0/${igUserId}`;
  const containerRes = await fetch(`${baseUrl}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caption,
      media_type:   'REELS',
      access_token: accessToken,
    }),
  });
  const container = await containerRes.json() as ContainerResponse;

  if (!containerRes.ok || !container.id) {
    const err: any = new ApiError(
      containerRes.status,
      'PLATFORM_API_ERROR',
      `Instagram container creation failed: ${container?.error?.message ?? containerRes.statusText}`
    );
    err.platformBody = container;
    throw err;
  }
  const publishRes = await fetch(`${baseUrl}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id:  container.id,
      access_token: accessToken,
    }),
  });
  const published = await publishRes.json() as PublishResponse;

  if (!publishRes.ok) {
    const err: any = new ApiError(
      publishRes.status,
      'PLATFORM_API_ERROR',
      `Instagram publish failed: ${published?.error?.message ?? publishRes.statusText}`
    );
    err.platformBody = published;
    throw err;
  }

  return { platformPostId: published?.id ?? null };
};
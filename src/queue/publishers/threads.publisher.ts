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
interface ThreadsApiError {
    message?: string;
    type?: string;
    code?: number;
}
interface ContainerResponse {
    id?: string;
    error?: ThreadsApiError;
}
interface PublishResponse {
    id?: string;
    error?: ThreadsApiError;
}
export const threadsPublisher = async (
    input: PublisherInput
): Promise<PublisherResult> => {
    const account = await prisma.socialAccount.findUnique({
        where: {
            userId_platform: {
                userId:   input.userId,
                platform: 'Threads',
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
            'Threads account not connected. Link it first in Settings.'
        );
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
        throw new ApiError(
            401,
            'TOKEN_EXPIRED',
            `Threads token expired for @${account.handle}. Reconnect your account.`
        );
    }
    const accessToken = decrypt(account.accessToken);
    const userId      = decrypt(account.platformUserId);
    const hashtagStr = input.hashtags
        .slice(0, 3)
        .map(h => h.startsWith('#') ? h : `#${h}`)
        .join(' ');
    const text = `${input.content} ${hashtagStr}`.trim().slice(0, 500);
    const baseUrl = `https://graph.threads.net/v1.0/${userId}`;
    const containerRes = await fetch(`${baseUrl}/threads`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_type:   'TEXT',
            text,
            access_token: accessToken,
        }),
    });
    const container = await containerRes.json() as ContainerResponse;
    if (!containerRes.ok || !container.id) {
        const err: any = new ApiError(
            containerRes.status,
            'PLATFORM_API_ERROR',
            `Threads container creation failed: ${container?.error?.message ?? containerRes.statusText}`
        );
        err.platformBody = container;
        throw err;
    }
    const publishRes = await fetch(`${baseUrl}/threads_publish`, {
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
            `Threads publish failed: ${published?.error?.message ?? publishRes.statusText}`
        );
        err.platformBody = published;
        throw err;
    }
    return { platformPostId: published?.id ?? null };
};
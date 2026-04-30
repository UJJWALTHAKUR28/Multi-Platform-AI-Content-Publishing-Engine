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
interface TwitterErrorResponse {
    title?: string;
    detail?: string;
    type?: string;
    status?: number;
    errors?: { message: string; parameters?: Record<string, string[]> }[];
}
interface TwitterSuccessResponse {
    data?: {
        id?: string;
        text?: string;
    };
}
type TwitterResponse = TwitterErrorResponse & TwitterSuccessResponse;
export const twitterPublisher = async (input: PublisherInput): Promise<PublisherResult> => {
    const account = await prisma.socialAccount.findUnique({
        where: {
            userId_platform: {
                userId: input.userId,
                platform: 'Twitter',
            },
        },
        select: {
            accessToken: true,
            tokenExpiresAt: true,
            handle: true,
        },
    });
    if (!account) {
        throw new ApiError(400,'ACCOUNT_NOT_CONNECTED','Twitter account not connected. Link it first in Settings.');
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
        throw new ApiError(401,'TOKEN_EXPIRED',`Twitter token expired for @${account.handle}. Reconnect your account.`);
    }
    const accessToken = decrypt(account.accessToken);
    const hashtagStr = input.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
    const tweetText = `${input.content} ${hashtagStr}`.trim().slice(0, 280);
    const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: tweetText }),
    });
    const body = await response.json() as TwitterResponse;
    if (!response.ok) {
        const err: any = new ApiError(
            response.status,
            'PLATFORM_API_ERROR',
            `Twitter API error: ${body?.title ?? body?.detail ?? response.statusText}`
        );
        err.platformBody = body;
        if (response.status === 429) {
            const resetTs = response.headers.get('x-rate-limit-reset');
            if (resetTs) err.retryAfterMs = (parseInt(resetTs) * 1000) - Date.now();}
        throw err;
    }
    return { platformPostId: body?.data?.id ?? null };
};
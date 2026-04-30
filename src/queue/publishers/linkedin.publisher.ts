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

interface LinkedInErrorResponse {
    message?: string;
    status?: number;
    code?: number;
}

interface LinkedInSuccessResponse {
    id?: string;
}

type LinkedInResponse = LinkedInErrorResponse & LinkedInSuccessResponse;
export const linkedinPublisher = async (input: PublisherInput): Promise<PublisherResult> => {
    const account = await prisma.socialAccount.findUnique({
        where: {
            userId_platform: {
                userId: input.userId,
                platform: 'Linkedin',
            },
        },
        select: {
            accessToken: true,
            platformUserId: true,
            tokenExpiresAt: true,
            handle: true,
        },
    });
    if (!account) {
        throw new ApiError(
            400,
            'ACCOUNT_NOT_CONNECTED',
            'LinkedIn account not connected. Link it first in Settings.'
        );
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
        throw new ApiError(
            401,
            'TOKEN_EXPIRED',
            `LinkedIn token expired for ${account.handle}. Reconnect your account.`
        );
    }
    const accessToken = decrypt(account.accessToken);
    const hashtagStr = input.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
    const postText = `${input.content}\n\n${hashtagStr}`.trim();
    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
            author: `urn:li:person:${account.platformUserId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: postText },
                    shareMediaCategory: 'NONE',
                },
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
        }),
    });
    const body = await response.json() as LinkedInResponse;
    if (!response.ok) {
        const err: any = new ApiError(
            response.status,
            'PLATFORM_API_ERROR',
            `LinkedIn API error: ${body?.message ?? response.statusText}`
        );
        err.platformBody = body;
        throw err;
    }
    const postId = response.headers.get('x-restli-id') ?? body?.id ?? null;
    return { platformPostId: postId };
};
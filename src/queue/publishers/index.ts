import { twitterPublisher } from './twitter.publisher';
import { linkedinPublisher } from './linkedin.publisher';
import { instagramPublisher } from './instagram.publisher';
import { threadsPublisher } from './threads.publisher';

import { ApiError } from '../../utils/api-error';

export { twitterPublisher, linkedinPublisher, instagramPublisher, threadsPublisher };

type PublisherFn = (input: {
    userId: string;
    content: string;
    hashtags: string[];
    platform: string;
}) => Promise<{ platformPostId: string | null }>;

const PUBLISHERS: Record<string, PublisherFn> = {
    Twitter: twitterPublisher,
    Linkedin: linkedinPublisher,
    Instagram: instagramPublisher,
    Threads: threadsPublisher,
};


export const getPublisher = (platform: string): PublisherFn => {
    const publisher = PUBLISHERS[platform];

    if (!publisher) {
        throw new ApiError(
            400,
            'INVALID_PLATFORM',
            `No publisher implemented for platform: ${platform}. Valid platforms: ${Object.keys(PUBLISHERS).join(', ')}`
        );
    }

    return publisher;
};
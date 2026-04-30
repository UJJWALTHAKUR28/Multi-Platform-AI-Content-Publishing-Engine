import { Job } from 'bullmq';
import { prisma } from "../../db/prisma";
import { PublishJobData } from '../publish.queue';
import { getPublisher } from '../publishers'
import { ApiError } from '../../utils/api-error';
import { Prisma } from '@prisma/client';
export const processPublishJob = async (job: Job<PublishJobData>): Promise<void> => {
    const {platformPostId,postId,userId,platform,content,hashtags,} = job.data;
    await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
            status: 'InProgress',
            attemps: { increment: 1 },
        },
    });
    const publisher = getPublisher(platform);
    const result = await publisher({ userId, content, hashtags, platform });
    await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
            status: 'Published',
            publishedAt: new Date(),
            platformPostId: result.platformPostId ?? null,
            errorMessage: null,
            platformError: Prisma.JsonNull,
            retryAfter: null,
        },
    });
    await syncPostStats(postId);
};
export const handleJobFailure = async (job: Job<PublishJobData>,error: Error): Promise<void> => {
    const { platformPostId, postId } = job.data;
    let retryAfter: Date | null = null;
    if ((error as any).retryAfterMs) {
        retryAfter = new Date(Date.now() + (error as any).retryAfterMs);
    }
    await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
            status: 'Failed',
            errorMessage: error.message,
            platformError: (error as any).platformBody ??Prisma.JsonNull,
            retryAfter,
        },
    });
    await syncPostStats(postId);
};
export const syncPostStats = async (postId: string): Promise<void> => {
    const platformPosts = await prisma.platformPost.findMany({
        where: { postId },
        select: { status: true },
    });
    if (platformPosts.length === 0) return;
    const statuses = platformPosts.map(pp => pp.status);
    const allPublished = statuses.every(s => s === 'Published');
    const allFailed = statuses.every(s => s === 'Failed');
    const allCancelled = statuses.every(s => s === 'Cancelled');
    const anyPublished = statuses.some(s => s === 'Published');
    const anyActive = statuses.some(s => s === 'InProgress' || s === 'Queued');
    let postStats: string;
    if (allPublished) postStats = 'Published';
    else if (allFailed) postStats = 'Failed';
    else if (allCancelled) postStats = 'Cancelled';
    else if (anyPublished) postStats = 'Partial';
    else if (anyActive) postStats = 'Processing';
    else postStats = 'Failed';
    await prisma.post.update({
        where: { id: postId },
        data: { stats: postStats as any },
    });
};
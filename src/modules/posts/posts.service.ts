import { prisma } from '../../db/prisma';
import { enqueuePublishJob, cancelJob } from '../../queue/publish.queue';
import { createAuditLog } from '../../services/audit.service';
import { ApiError } from '../../utils/api-error';
import type { PublishPostInput, SchedulePostInput, ListPostsQuery } from './posts.schema';
import type { RequestMeta } from '../../utils/request-meta.util';
async function createAndEnqueue(userId: string, data: PublishPostInput, publishAt: Date | null, meta: RequestMeta) {
  const delayMs = publishAt && publishAt > new Date() ? publishAt.getTime() - Date.now() : 0;
  const post = await prisma.post.create({
    data: { userId, idea: data.idea, postType: data.postType as any, tone: data.tone, modelused: data.modelUsed ?? data.model, aiModel: data.model, tokensUsed: data.tokensUsed ?? null, stats: 'Pending', publishAt: publishAt ?? null, },
    select: { id: true, idea: true, postType: true, tone: true, modelused: true, aiModel: true, tokensUsed: true, stats: true, publishAt: true, createdAt: true, },
  });
  const platformPostResults: {
    platform: string; platformPostId: string; content: string; charCount: number; hashtags: string[]; bullJobId: string; status: string;
  }[] = [];
  for (const platform of data.platforms) {
    const key = platform as keyof typeof data.content;
    const generated = data.content[key];
    if (!generated || !generated.content) {
      const pp = await prisma.platformPost.create({
        data: { postId: post.id, platform: platform as any, content: '', hashtages: [], status: 'Failed', errorMessage: 'No content provided for this platform', },
      });
      platformPostResults.push({
        platform, platformPostId: pp.id, content: '', charCount: 0, hashtags: [], bullJobId: '', status: 'Failed',
      });
      continue;
    }
    const pp = await prisma.platformPost.create({
      data: { postId: post.id, platform: platform as any, content: generated.content, hashtages: generated.hashtags, status: 'Queued', publishAt: publishAt ?? null, },
    });
    const bullJobId = await enqueuePublishJob(
      { platformPostId: pp.id, postId: post.id, userId, platform, content: generated.content, hashtags: generated.hashtags, publishAt: publishAt ? publishAt.toISOString() : null, retryCount: 0, }, delayMs);
    await prisma.platformPost.update({
      where: { id: pp.id }, data: { bulljobId: bullJobId },
    });
    platformPostResults.push({
      platform, platformPostId: pp.id, content: generated.content, charCount: generated.charCount ?? generated.content.length, hashtags: generated.hashtags, bullJobId, status: 'Queued',
    });
  }
  const anyQueued = platformPostResults.some((p) => p.status === 'Queued');
  if (anyQueued) {
    await prisma.post.update({ where: { id: post.id }, data: { stats: delayMs > 0 ? 'Pending' : 'Processing' }, });
  } else {
    await prisma.post.update({ where: { id: post.id }, data: { stats: 'Failed' } });
  }
  await createAuditLog({
    userId, action: 'POST_CREATED', resource: 'Post', resourceId: post.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent, metadata: { platforms: data.platforms, model: data.model, scheduled: !!publishAt, },
  });
  return {
    post: {
      ...post,
      stats: anyQueued ? (delayMs > 0 ? 'Pending' : 'Processing') : 'Failed',
    },
    platforms: platformPostResults,
  };
}
export async function publishPost(userId: string, data: PublishPostInput, meta: RequestMeta,) {
  return createAndEnqueue(userId, data, null, meta);
}
export async function schedulePost(userId: string, data: SchedulePostInput, meta: RequestMeta,) {
  const publishAt = new Date(data.publishAt);
  return createAndEnqueue(userId, data, publishAt, meta);
}
export async function listPosts(userId: string, query: ListPostsQuery) {
  const { page, limit, status, platform, date_from, date_to } = query;
  const skip = (page - 1) * limit;
  const where: any = { userId, deletedat: null, };
  if (status) where.stats = status;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) where.createdAt.gte = new Date(date_from);
    if (date_to) where.createdAt.lte = new Date(date_to);
  }
  let postIds: string[] | undefined;
  if (platform) {
    const pps = await prisma.platformPost.findMany({
      where: { platform: platform as any },
      select: { postId: true },
      distinct: ['postId'],
    });
    postIds = pps.map((p) => p.postId);
    if (postIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }
    where.id = { in: postIds };
  }
  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: {
        platformPosts: { select: { id: true, platform: true, content: true, hashtages: true, status: true, attemps: true, publishAt: true, errorMessage: true, bulljobId: true, createdAt: true, updatedAt: true, }, },
      },
    }),
  ]);
  return {
    data: posts,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit), },
  };
}
export async function getPostById(userId: string, postId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId, deletedat: null },
    include: {
      platformPosts: { select: { id: true, platform: true, content: true, hashtages: true, status: true, attemps: true, publishAt: true, errorMessage: true, platformError: true, bulljobId: true, createdAt: true, updatedAt: true, }, },
    },
  });
  if (!post) throw ApiError.notFound('Post not found');
  return post;
}
export async function retryFailedPlatforms(userId: string, postId: string, meta: RequestMeta,) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId, deletedat: null },
    include: { platformPosts: true },
  });
  if (!post) throw ApiError.notFound('Post not found');
  const failedPlatforms = post.platformPosts.filter((pp) => pp.status === 'Failed',);
  if (failedPlatforms.length === 0) {
    throw ApiError.badRequest('No failed platform jobs to retry');
  }
  const retryResults: { platform: string; platformPostId: string; bullJobId: string }[] = [];
  for (const pp of failedPlatforms) {
    await prisma.platformPost.update({
      where: { id: pp.id },
      data: { status: 'Queued', errorMessage: null, platformError: undefined, retryAfter: null },
    });
    const bullJobId = await enqueuePublishJob({ platformPostId: pp.id, postId: post.id, userId, platform: pp.platform, content: pp.content, hashtags: pp.hashtages, publishAt: null, retryCount: pp.attemps, }, 0);
    await prisma.platformPost.update({ where: { id: pp.id }, data: { bulljobId: bullJobId }, });
    retryResults.push({ platform: pp.platform, platformPostId: pp.id, bullJobId, });
  }
  await prisma.post.update({ where: { id: postId }, data: { stats: 'Processing' }, });
  await createAuditLog({ userId, action: 'POST_RETRIED', resource: 'Post', resourceId: postId, ipAddress: meta.ipAddress, userAgent: meta.userAgent, metadata: { retriedPlatforms: retryResults.map((r) => r.platform) }, });
  return {
    message: `Retrying ${retryResults.length} failed platform job(s)`,
    retried: retryResults,
  };
}
export async function cancelScheduledPost(
  userId: string,
  postId: string,
  meta: RequestMeta,
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId, deletedat: null },
    include: { platformPosts: true },
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.stats === 'Published') {
    throw ApiError.badRequest('Cannot cancel a post that has already been published');
  }
  if (post.stats === 'Cancelled') {
    throw ApiError.badRequest('Post is already cancelled');
  }
  const cancellationResults: { platform: string; cancelled: boolean }[] = [];

  for (const pp of post.platformPosts) {
    if (pp.status === 'Published') {
      cancellationResults.push({ platform: pp.platform, cancelled: false });
      continue;
    }

    let cancelled = false;
    if (pp.bulljobId) {
      cancelled = await cancelJob(pp.bulljobId);
    }

    await prisma.platformPost.update({
      where: { id: pp.id },
      data: { status: 'Cancelled' },
    });

    cancellationResults.push({ platform: pp.platform, cancelled });
  }
  await prisma.post.update({
    where: { id: postId },
    data: { stats: 'Cancelled', deletedat: new Date() },
  });

  await createAuditLog({
    userId,
    action: 'POST_CANCELLED',
    resource: 'Post',
    resourceId: postId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    message: 'Post cancelled successfully',
    platforms: cancellationResults,
  };
}
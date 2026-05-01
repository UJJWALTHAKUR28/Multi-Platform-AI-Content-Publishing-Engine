import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { enqueuePublishJob, cancelJob } from '../../queue/publish.queue';
import { createAuditLog } from '../../services/audit.service';
import { ApiError } from '../../utils/api-error';
import type { PublishPostInput, SchedulePostInput, ListPostsQuery } from './posts.schema';
import type { RequestMeta } from '../../utils/request-meta.util';
const PLATFORM_POST_SELECT = {
  id          : true,
  platform    : true,
  content     : true,
  hashtages   : true,
  status      : true,
  attemps     : true,
  publishAt   : true,
  errorMessage: true,
  bulljobId   : true,
  createdAt   : true,
  updatedAt   : true,
} as const;
async function createAndEnqueue(
  userId   : string,
  data     : PublishPostInput,
  publishAt: Date | null,
  meta     : RequestMeta,
) {
  const delayMs = publishAt && publishAt > new Date()
    ? publishAt.getTime() - Date.now()
    : 0;
  const post = await prisma.post.create({
    data: {
      userId,
      idea      : data.idea,
      postType  : data.postType  as any,
      tone      : data.tone,
      modelused : data.modelUsed ?? data.model,
      aiModel   : data.model,
      tokensUsed: data.tokensUsed ?? null,
      stats     : 'Pending',
      publishAt : publishAt ?? null,
    },
    select: {
      id        : true,
      idea      : true,
      postType  : true,
      tone      : true,
      modelused : true,
      aiModel   : true,
      tokensUsed: true,
      stats     : true,
      publishAt : true,
      createdAt : true,
    },
  });
  type PlatformResult = {
    platform       : string;
    platformPostId : string;
    content        : string;
    charCount      : number;
    hashtags       : string[];
    bullJobId      : string;
    status         : string;
    error?         : string;
  };
  const platformResults: PlatformResult[] = [];
  for (const platform of data.platforms) {
    const generated = data.content[platform as keyof typeof data.content];
    if (!generated?.content?.trim()) {
      const pp = await prisma.platformPost.create({
        data: {
          postId      : post.id,
          platform    : platform as any,
          content     : '',
          hashtages   : [],
          status      : 'Failed',
          errorMessage: `No content provided for ${platform}`,
          publishAt   : publishAt ?? null,
        },
      });
      platformResults.push({
        platform,
        platformPostId: pp.id,
        content       : '',
        charCount     : 0,
        hashtags      : [],
        bullJobId     : '',
        status        : 'Failed',
        error         : `No content provided for ${platform}`,
      });
      continue;
    }
    const pp = await prisma.platformPost.create({
      data: {
        postId   : post.id,
        platform : platform as any,
        content  : generated.content,
        hashtages: generated.hashtags,
        status   : 'Queued',
        publishAt: publishAt ?? null,
      },
    });
    let bullJobId = '';
    try {
      bullJobId = await enqueuePublishJob(
        {
          platformPostId: pp.id,postId:post.id,userId,platform,content:generated.content,hashtags:generated.hashtags,publishAt:publishAt ? publishAt.toISOString() : null,
          retryCount:0,
        },
        delayMs,
      );
      await prisma.platformPost.update({
        where: { id: pp.id },
        data : { bulljobId: bullJobId },
      });
    } catch (queueErr: any) {
      console.error(`[Posts] Failed to enqueue job for ${platform} (postId=${post.id}):`, queueErr?.message);
    }
    platformResults.push({
      platform,
      platformPostId: pp.id,
      content       : generated.content,
      charCount     : generated.charCount ?? generated.content.length,
      hashtags      : generated.hashtags,
      bullJobId,
      status        : 'Queued',
    });
  }
  const statuses   = platformResults.map((r) => r.status);
  const anyQueued  = statuses.some((s) => s === 'Queued');
  const allFailed  = statuses.every((s) => s === 'Failed');
  let aggregateStats: string;
  if (allFailed)       aggregateStats = 'Failed';
  else if (delayMs > 0) aggregateStats = 'Pending';
  else                  aggregateStats = 'Processing';
  await prisma.post.update({
    where: { id: post.id },
    data : { stats: aggregateStats as any },
  });
  await createAuditLog({
    userId,
    action    : 'POST_CREATED',
    resource  : 'Post',
    resourceId: post.id,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    metadata  : {
      platforms: data.platforms,
      model    : data.model,
      scheduled: !!publishAt,
      publishAt: publishAt?.toISOString() ?? null,
    },
  });
  return {
    post: { ...post, stats: aggregateStats },
    platforms: platformResults,
    summary: {
      total  : platformResults.length,
      queued : platformResults.filter((r) => r.status === 'Queued').length,
      failed : platformResults.filter((r) => r.status === 'Failed').length,
    },
  };
}
export async function publishPost(
  userId: string,
  data  : PublishPostInput,
  meta  : RequestMeta,
) {
  return createAndEnqueue(userId, data, null, meta);
}
export async function schedulePost(
  userId: string,
  data  : SchedulePostInput,
  meta  : RequestMeta,
) {
  const publishAt = new Date(data.publishAt);
  return createAndEnqueue(userId, data, publishAt, meta);
}
export async function listPosts(userId: string, query: ListPostsQuery) {
  const { page, limit, status, platform, date_from, date_to } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.PostWhereInput = {
    userId,
    deletedat: null,
  };
  if (status)    where.stats = status as any;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) (where.createdAt as any).gte = new Date(date_from);
    if (date_to)   (where.createdAt as any).lte = new Date(date_to);
  }
  if (platform) {
    const pps = await prisma.platformPost.findMany({
      where : {
        platform: platform as any,
        post    : { userId, deletedat: null },  
      },
      select  : { postId: true },
      distinct: ['postId'],
    });
    if (pps.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
    where.id = { in: pps.map((p) => p.postId) };
  }
  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      skip,
      take    : limit,
      orderBy : { createdAt: 'desc' },
      include : {
        platformPosts: { select: PLATFORM_POST_SELECT },
      },
    }),
  ]);
  return {
    data: posts,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
export async function getPostById(userId: string, postId: string) {
  const post = await prisma.post.findFirst({
    where  : { id: postId, userId, deletedat: null },
    include: {
      platformPosts: {
        select: {
          ...PLATFORM_POST_SELECT,
          platformPostId: true,
          platformError : true,
          retryAfter    : true,
        },
      },
    },
  });
  if (!post) throw ApiError.notFound('Post not found');
  return post;
}
export async function retryFailedPlatforms(
  userId: string,
  postId: string,
  meta  : RequestMeta,
) {
  const post = await prisma.post.findFirst({
    where  : { id: postId, userId, deletedat: null },   // scoped to user
    include: { platformPosts: true },
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.stats === 'Cancelled') {
    throw ApiError.badRequest('Cannot retry a cancelled post');
  }
  const failedPlatforms = post.platformPosts.filter((pp) => pp.status === 'Failed');

  if (failedPlatforms.length === 0) {
    throw ApiError.badRequest(
      'No failed platform jobs to retry. ' +
      `Current statuses: ${post.platformPosts.map((p) => `${p.platform}=${p.status}`).join(', ')}`,
    );
  }
  const retryResults: { platform: string; platformPostId: string; bullJobId: string }[] = [];
  for (const pp of failedPlatforms) {
    await prisma.platformPost.update({
      where: { id: pp.id },
      data : {
        status       : 'Queued',
        errorMessage : null,
        platformError: Prisma.JsonNull,
        retryAfter   : null,
      },
    });
    let bullJobId = '';
    try {
      bullJobId = await enqueuePublishJob(
        {
          platformPostId: pp.id,
          postId        : post.id,
          userId,
          platform      : pp.platform,
          content       : pp.content,
          hashtags      : pp.hashtages,
          publishAt     : null,
          retryCount    : pp.attemps,
        },
        0,
      );
      await prisma.platformPost.update({
        where: { id: pp.id },
        data : { bulljobId: bullJobId },
      });
    } catch (queueErr: any) {
      console.error(`[Posts] Retry enqueue failed for ${pp.platform}:`, queueErr?.message);
    }
    retryResults.push({ platform: pp.platform, platformPostId: pp.id, bullJobId });
  }
  await prisma.post.update({
    where: { id: postId },
    data : { stats: 'Processing' },
  });
  await createAuditLog({
    userId,
    action    : 'POST_RETRIED',
    resource  : 'Post',
    resourceId: postId,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    metadata  : { retriedPlatforms: retryResults.map((r) => r.platform) },
  });
  return {
    message: `Retrying ${retryResults.length} failed platform job(s)`,
    retried: retryResults,
  };
}
export async function cancelScheduledPost(
  userId: string,
  postId: string,
  meta  : RequestMeta,
) {
  const post = await prisma.post.findFirst({
    where  : { id: postId, userId, deletedat: null },   // scoped to user
    include: { platformPosts: true },
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.stats === 'Published') {
    throw ApiError.badRequest('Cannot cancel a post that has already been fully published');
  }
  if (post.stats === 'Cancelled') {
    throw ApiError.badRequest('Post is already cancelled');
  }
  const cancellationResults: {
    platform : string;
    prevStatus: string;
    jobCancelled: boolean;
  }[] = [];
  for (const pp of post.platformPosts) {
    if (pp.status === 'Published') {
      cancellationResults.push({ platform: pp.platform, prevStatus: pp.status, jobCancelled: false });
      continue;
    }

    let jobCancelled = false;
    if (pp.bulljobId) {
      jobCancelled = await cancelJob(pp.bulljobId);
    }
    await prisma.platformPost.update({
      where: { id: pp.id },
      data : { status: 'Cancelled' },
    });
    cancellationResults.push({ platform: pp.platform, prevStatus: pp.status, jobCancelled });
  }
  const anyPublished = post.platformPosts.some((pp) => pp.status === 'Published');
  await prisma.post.update({
    where: { id: postId },
    data : {
      stats    : anyPublished ? 'Partial' : 'Cancelled',
      deletedat: new Date(),
    },
  });
  await createAuditLog({
    userId,
    action    : 'POST_CANCELLED',
    resource  : 'Post',
    resourceId: postId,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    metadata  : {
      cancelledPlatforms: cancellationResults.filter((r) => r.prevStatus !== 'Published').map((r) => r.platform),
      alreadyPublished  : cancellationResults.filter((r) => r.prevStatus === 'Published').map((r) => r.platform),},
  });
  return {
    message  : 'Post cancelled successfully',
    platforms: cancellationResults,
  };
}
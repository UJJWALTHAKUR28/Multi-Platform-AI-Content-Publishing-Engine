import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
export async function getDashboardStats(userId: string) {
  const totalPosts = await prisma.post.count({
    where: { userId, deletedat: null },
  });
  const platformPosts = await prisma.platformPost.findMany({
    where : { post: { userId, deletedat: null } },    // scoped to user
    select: { platform: true, status: true },
  });
  const postsPerPlatform: Record<string, number> = {};
  const publishedPerPlatform: Record<string, number> = {};
  for (const pp of platformPosts) {
    postsPerPlatform[pp.platform]   = (postsPerPlatform[pp.platform]   ?? 0) + 1;
    if (pp.status === 'Published') {
      publishedPerPlatform[pp.platform] = (publishedPerPlatform[pp.platform] ?? 0) + 1;
    }
  }
  const terminalJobs   = platformPosts.filter((pp) => ['Published', 'Failed', 'Cancelled'].includes(pp.status));
  const publishedJobs  = terminalJobs.filter((pp) => pp.status === 'Published');
  const successRate    = terminalJobs.length === 0
    ? null
    : Math.round((publishedJobs.length / terminalJobs.length) * 100);
  const statusGroupsRaw = await prisma.post.groupBy({
    by   : ['stats'],
    where: { userId, deletedat: null },
    _count: { _all: true },
  });
  const postsByStatus: Record<string, number> = {};
  for (const g of statusGroupsRaw) {
    postsByStatus[g.stats] = g._count._all;
  }
  const modelGroupsRaw = await prisma.post.groupBy({
    by   : ['aiModel'],
    where: { userId, deletedat: null, aiModel: { not: null } },
    _count: { _all: true },
  });
  const modelUsage: Record<string, number> = {};
  for (const g of modelGroupsRaw) {
    if (g.aiModel) modelUsage[g.aiModel] = g._count._all;
  }
  const since7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const recentPosts = await prisma.post.findMany({
    where : { userId, deletedat: null, createdAt: { gte: since7Days } },
    select: { createdAt: true },
  });
  const activityByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1_000);
    activityByDay[d.toISOString().slice(0, 10)] = 0;
  }
  for (const p of recentPosts) {
    const day = p.createdAt.toISOString().slice(0, 10);
    if (day in activityByDay) activityByDay[day]++;
  }
  const scheduledUpcoming = await prisma.post.count({
    where: {
      userId,
      deletedat: null,
      stats    : 'Pending',
      publishAt: { gt: new Date() },
    },
  });
  const tokenStats = await prisma.post.aggregate({
    where: { userId, deletedat: null, tokensUsed: { not: null } },
    _sum : { tokensUsed: true },
    _avg : { tokensUsed: true },
    _max : { tokensUsed: true },
  });
  return {
    totalPosts,
    successRate,
    postsPerPlatform,
    publishedPerPlatform,
    postsByStatus,
    modelUsage,
    scheduledUpcoming,
    activityLast7Days: activityByDay,
    tokenStats: {
      totalTokensUsed  : tokenStats._sum.tokensUsed ?? 0,
      avgTokensPerPost : tokenStats._avg.tokensUsed ? Math.round(tokenStats._avg.tokensUsed) : 0,
      maxTokensPerPost : tokenStats._max.tokensUsed ?? 0,
    },
  };
}

export async function getPostHistory(
  userId: string,
  query : {
    page      : number;
    limit     : number;
    status?   : string;
    platform? : string;
    date_from?: string;
    date_to?  : string;
  },
) {
  const { page, limit, status, platform, date_from, date_to } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.PostWhereInput = {
    userId,
    deletedat: null,
  };
  if (status) where.stats = status as any;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) (where.createdAt as any).gte = new Date(date_from);
    if (date_to)   (where.createdAt as any).lte = new Date(date_to);
  }
  if (platform) {
    const pps = await prisma.platformPost.findMany({
      where : {
        platform: platform as any,
        post    : { userId, deletedat: null },   // ← security fix
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
        platformPosts: {
          select: {
            id          : true,
            platform    : true,
            content     : true,
            hashtages   : true,
            status      : true,
            attemps     : true,
            publishAt   : true,
            errorMessage: true,
            bulljobId   : true,
            updatedAt   : true,
          },},},}),]);
  return {
    data: posts,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
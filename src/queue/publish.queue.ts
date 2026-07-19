import { Queue } from 'bullmq';
import { redis } from '../config/redis';

export interface PublishJobData {
  platformPostId: string;
  postId: string;
  userId: string;
  platform: string;
  content: string;
  hashtags: string[];
  publishAt: string | null;
  retryCount: number;
}

export const BACKOFF_DELAYS = [1000, 5000, 25000];

// Queue is optional - only created if Redis is available
export const publishQueue = redis ? new Queue<PublishJobData>('publish', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'custom',
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
}) : null;

export const enqueuePublishJob = async (data: PublishJobData, delayMs: number = 0): Promise<string> => {
  if (!publishQueue) {
    console.warn('Queue not available - Redis not configured');
    return 'mock-job-id';
  }
  const job = await publishQueue.add(`${data.platform.toLowerCase()}:${data.postId}`, data,
    {
      delay: delayMs,
      jobId: data.platformPostId,
    }
  );
  return job.id!;
};

export const cancelJob = async (bullJobId: string): Promise<boolean> => {
  if (!publishQueue) {
    console.warn('Queue not available - Redis not configured');
    return false;
  }
  try {
    const job = await publishQueue.getJob(bullJobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting') {
      await job.remove();
      return true;
    }
    return false;
  } catch {
    return false;
  }
};


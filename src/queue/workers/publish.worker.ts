import { Worker, Job } from 'bullmq';
import { redis } from '../../config/redis';
import { PublishJobData } from '../publish.queue';
import { processPublishJob, handleJobFailure } from '../processors/publish.proccesor';
export const startPublishWorker = (): Worker => {
    const worker = new Worker<PublishJobData>('publish',async (job: Job<PublishJobData>) => {await processPublishJob(job);},
        {
            connection: redis,
            concurrency: 5,
        });
    worker.on('active', (job: Job<PublishJobData>) => {
        console.log(
            `[Queue] Job started | ${job.data.platform} | postId: ${job.data.postId} | attempt: ${job.attemptsMade + 1}/3`
        );
    });
    worker.on('completed', (job: Job<PublishJobData>) => {
        console.log(
            `[Queue] Job completed | ${job.data.platform} | platformPostId: ${job.data.platformPostId}`
        );
    });
    worker.on('failed', async (job: Job<PublishJobData> | undefined, error: Error) => {
        if (!job) return;

        const isLastAttempt = job.attemptsMade >= 3;

        console.error(
            `[Queue] Job failed | ${job.data.platform} | attempt: ${job.attemptsMade}/3 | error: ${error.message}`
        );
        if (isLastAttempt) {
            await handleJobFailure(job, error).catch(dbErr => {
                console.error('[Queue] Failed to update DB after job failure:', dbErr);
            });
        }
    });
    worker.on('error', (error: Error) => {
        console.error('[Queue] Worker error:', error.message);
    });
    worker.on('stalled', (jobId: string) => {
        console.warn(`[Queue] Job stalled and will be retried | jobId: ${jobId}`);
    });
    console.log('[Queue] Publish worker started — listening for jobs');
    return worker;
};
export const gracefulShutdown = async (worker: Worker): Promise<void> => {
    console.log('[Queue] Shutting down worker gracefully...');
    await worker.close(true);
    console.log('[Queue] Worker shut down');
};
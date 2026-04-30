import "dotenv/config";
import app from "./app";
import { prisma } from "./db/prisma";
import { redis } from "./config/redis";
import { startPublishWorker, gracefulShutdown } from './queue';
import { setupBot, registerWebhook } from './bot/telegrambot';
const PORT = process.env.PORT || 3000;
async function startServer() {
  try {
    await prisma.$connect();
    console.log('Connected to Prisma database');
    await redis.ping();
    console.log('Connected to Redis');
    setupBot(app);
    app.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_URL) {
        await registerWebhook().catch(err =>
          console.error('[Bot] Webhook registration failed:', err.message)
        );}});
  } catch (error) {
    console.error('Error starting server:', error);
  }}
const worker = startPublishWorker();
process.on('SIGTERM', async () => {
  await gracefulShutdown(worker);
  process.exit(0);
});
process.on('SIGINT', async () => {await gracefulShutdown(worker);process.exit(0);});
startServer();
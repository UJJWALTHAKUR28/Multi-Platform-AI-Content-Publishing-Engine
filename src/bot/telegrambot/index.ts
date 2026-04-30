import TelegramBot         from 'node-telegram-bot-api';
import { Application }     from 'express';
import { handlePostFlow }  from './handlers/posts.handlers';
import { handleStatus }    from './handlers/status.handlers';
import { handleAccounts }  from './handlers/accounts.handlers';
import { handleHelp, handleCancel } from './handlers/help.handlers';
import { clearSession }    from './session.service';
import { prisma }          from '../../db/prisma';
let botInstance: TelegramBot | null = null;
export const getBot = (): TelegramBot => {
  if (!botInstance) throw new Error('Bot not initialized. Call setupBot() first.');
  return botInstance;
};
export const setupBot = (app: Application): void => {
  const token       = process.env.TELEGRAM_BOT_TOKEN;
  const webhookPath = `/bot/webhook`;

  if (!token) {
    console.warn('[Bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }
  const bot = new TelegramBot(token, { webHook: false });
  botInstance = bot;
  app.post(webhookPath, (req, res) => {
    const secretToken    = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const receivedSecret = (req.headers['x-telegram-bot-api-secret-token'] as string) ?? '';
    if (secretToken && receivedSecret !== secretToken) {
      console.warn('[Bot] Webhook rejected — invalid secret token');
      res.sendStatus(403);
      return;
    }
    res.sendStatus(200);
    bot.processUpdate(req.body);
  });
  const dedup = async (msg:     TelegramBot.Message,handler: () => Promise<void>,): Promise<void> => {
    const source     = 'telegram';
    const externalId = String(msg.message_id);
    try {
      await prisma.webhookEvent.create({
        data: { source, externalId, payload: msg as any, stats: 'PROCESSING' },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return;
    }
    try {
      await handler();
      await prisma.webhookEvent.updateMany({
        where: { source, externalId },
        data:  { stats: 'COMPLETED' },
      });
    } catch (handlerErr: any) {
      console.error('[Bot] Handler error:', handlerErr?.message);
      await prisma.webhookEvent.updateMany({
        where: { source, externalId },
        data:  { stats: 'FAILED', errorMessage: handlerErr?.message ?? 'Unknown error' },
      }).catch(() => {});
    }
  };
  bot.onText(/^\/start/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handlePostFlow(bot, { ...msg, text: '/start' }));
  });
  bot.onText(/^\/post/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handlePostFlow(bot, { ...msg, text: '/post' }));
  });
  bot.onText(/^\/status/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handleStatus(bot, msg));
  });
  bot.onText(/^\/accounts/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handleAccounts(bot, msg));
  });
  bot.onText(/^\/help/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handleHelp(bot, msg));
  });
  bot.onText(/^\/cancel/, async (msg: TelegramBot.Message) => {
    await dedup(msg, () => handleCancel(bot, msg, clearSession));
  });
  bot.on('message', async (msg: TelegramBot.Message) => {
    const text = msg.text ?? '';
    if (text.startsWith('/')) return; // already handled above
    await dedup(msg, () => handlePostFlow(bot, msg));
  });
  bot.on('error', (err: Error) => {
    console.error('[Bot] TelegramBot error:', err.message);
  });
  bot.on('polling_error', (err: Error) => {
    console.error('[Bot] Polling error (unexpected in webhook mode):', err.message);
  });
  console.log('[Bot] Telegram bot initialized — webhook route at', webhookPath);
};
export const registerWebhook = async (): Promise<void> => {
  const token      = process.env.TELEGRAM_BOT_TOKEN!;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL!;
  const secret     = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  const url = `https://api.telegram.org/bot${token}/setWebhook`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url:                  webhookUrl,
      secret_token:         secret,    
      allowed_updates:      ['message', 'callback_query'],
      drop_pending_updates: true,             
    }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (data.ok) {
    console.log('[Bot] Webhook registered:', webhookUrl);
  } else {
    console.error('[Bot] Webhook registration failed:', data.description);
  }
};
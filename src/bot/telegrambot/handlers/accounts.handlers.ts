import TelegramBot from 'node-telegram-bot-api';
import { prisma }     from '../../../db/prisma';
import { getSession } from '../session.service';

const PLATFORM_EMOJI: Record<string, string> = {
  Twitter:   '🐦',
  Linkedin:  '💼',
  Instagram: '📸',
  Threads:   '🧵',
};

export const handleAccounts = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> => {
  const chatId  = msg.chat.id;
  const session = await getSession(chatId);
  let userId    = session.userId;

  if (!userId) {
    const user = await prisma.user.findFirst({
      where:  { telegramChatId: String(chatId) },
      select: { id: true },
    });
    if (!user) {
      await bot.sendMessage(
        chatId,
        `⚠️ Your Telegram is not linked.\n\nVisit the dashboard → Settings → Telegram to link it.`
      );
      return;
    }
    userId = user.id;
  }

  const accounts = await prisma.socialAccount.findMany({
    where:   { userId },
    orderBy: { connectedAt: 'desc' },
    select: {
      platform:       true,
      handle:         true,
      tokenExpiresAt: true,
      connectedAt:    true,
    },
  });

  if (accounts.length === 0) {
    await bot.sendMessage(
      chatId,
      `📭 *No social accounts connected.*\n\n` +
      `Connect your accounts via the Postly API or dashboard:\n` +
      `\`POST /api/user/social-accounts\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let message = `🔗 *Connected accounts:*\n\n`;

  for (const acc of accounts) {
    const emoji   = PLATFORM_EMOJI[acc.platform] ?? '📝';
    const expired = acc.tokenExpiresAt && acc.tokenExpiresAt < new Date();
    const status  = expired ? '⚠️ Token expired' : '✅ Active';

    message += `${emoji} *${acc.platform}*\n`;
    message += `  Handle: ${acc.handle ?? 'N/A'}\n`;
    message += `  Status: ${status}\n`;
    if (expired) {
      message += `  _Reconnect via \`POST /api/user/social-accounts\`_\n`;
    }
    message += `\n`;
  }

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};
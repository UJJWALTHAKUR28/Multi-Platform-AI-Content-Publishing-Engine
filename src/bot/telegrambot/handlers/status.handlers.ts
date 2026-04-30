import TelegramBot from 'node-telegram-bot-api';
import { prisma }       from '../../../db/prisma';
import { getSession }   from '../session.service';
const JOB_EMOJI: Record<string, string> = {
  Queued:     '⏳',
  InProgress: '🔄',
  Published:  '✅',
  Failed:     '❌',
  Cancelled:  '🚫',
};
const POST_EMOJI: Record<string, string> = {
  Pending:    '⏳',
  Processing: '🔄',
  Partial:    '⚠️',
  Published:  '✅',
  Failed:     '❌',
  Cancelled:  '🚫',
};

const PLATFORM_EMOJI: Record<string, string> = {
  Twitter:   '🐦',
  Linkedin:  '💼',
  Instagram: '📸',
  Threads:   '🧵',
};

export const handleStatus = async (bot:TelegramBot,msg:TelegramBot.Message): Promise<void> => {
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
        `⚠️ Your Telegram is not linked to a Postly account.\n\nVisit the dashboard to link it.`
      );
      return;
    }
    userId = user.id;
  }
  const posts = await prisma.post.findMany({
    where:   { userId, deletedat: null },
    include: { platformPosts: true },
    orderBy: { createdAt: 'desc' },
    take:    5,
  });
  if (posts.length === 0) {
    await bot.sendMessage(
      chatId,
      `📭 You haven't published anything yet.\n\nType /post to create your first post.`
    );
    return;
  }
  let message = `📊 *Your last ${posts.length} post${posts.length > 1 ? 's' : ''}:*\n\n`;
  for (const post of posts) {
    const statusEmoji = POST_EMOJI[post.stats] ?? '❓';
    const idea        = post.idea.length > 60
      ? post.idea.slice(0, 60) + '…'
      : post.idea;
    message += `${statusEmoji} *${post.postType}* — ${statusEmoji} ${post.stats}\n`;
    message += `_"${idea}"_\n`;
    message += `🕐 ${post.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}\n`;
    for (const pp of post.platformPosts) {
      const pEmoji = PLATFORM_EMOJI[pp.platform] ?? '📝';
      const jEmoji = JOB_EMOJI[pp.status] ?? '❓';
      message    += `  ${pEmoji} ${pp.platform} ${jEmoji}`;
      if (pp.status === 'Failed' && pp.errorMessage) {
        message  += ` — _${pp.errorMessage.slice(0, 50)}_`;
      }
      message    += '\n';
    }
    message += `\n`;
  }
  message += `_Use /post to publish new content_`;
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};
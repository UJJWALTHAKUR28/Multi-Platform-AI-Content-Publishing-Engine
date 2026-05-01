import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../../../db/prisma';
import { getSession } from '../session.service';
import { formatInTz } from '../session.service';
const JOB_EMOJI: Record<string, string> = {
  Queued: '⏳',
  InProgress: '🔄',
  Published: '✅',
  Failed: '❌',
  Cancelled: '🚫',
};
const POST_EMOJI: Record<string, string> = {
  Pending: '🗓',
  Processing: '🔄',
  Partial: '⚠️',
  Published: '✅',
  Failed: '❌',
  Cancelled: '🚫',
};
const PLATFORM_EMOJI: Record<string, string> = {
  Twitter: '🐦',
  Linkedin: '💼',
  Instagram: '📸',
  Threads: '🧵',
};
export const handleStatus = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> => {
  const chatId = msg.chat.id;
  const session = await getSession(chatId);
  let userId = session.userId;
  if (!userId) {
    const user = await prisma.user.findFirst({
      where: { telegramChatId: String(chatId) },
      select: { id: true },
    });
    if (!user) {
      await bot.sendMessage(
        chatId,
        `⚠️ Your Telegram isn't linked yet.\n\nType /post and follow the prompts to link it.`,
      );
      return;
    }
    userId = user.id;
  }
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = userRecord?.timezone ?? 'UTC';
  const scheduled = await prisma.post.findMany({
    where: {
      userId,
      deletedat: null,
      stats: 'Pending',
      publishAt: { gt: new Date() },
    },
    include: { platformPosts: { select: { platform: true, status: true } } },
    orderBy: { publishAt: 'asc' },
    take: 5,
  });
  const recent = await prisma.post.findMany({
    where: {
      userId,
      deletedat: null,
      OR: [
        { publishAt: null },
        { publishAt: { lte: new Date() } },
      ],
    },
    include: { platformPosts: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  if (scheduled.length === 0 && recent.length === 0) {
    await bot.sendMessage(
      chatId,
      `📭 You haven't published or scheduled anything yet.\n\nType /post to create your first post.`,
    );
    return;
  }
  let message = '';
  if (scheduled.length > 0) {
    message += `🗓 *Upcoming Scheduled Posts (${scheduled.length})*\n\n`;
    for (const post of scheduled) {
      const scheduledAt = post.publishAt ? formatInTz(post.publishAt, tz) : '—';
      const idea = post.idea.length > 50 ? post.idea.slice(0, 50) + '…' : post.idea;
      const platforms = post.platformPosts
        .map(pp => `${PLATFORM_EMOJI[pp.platform] ?? '📝'} ${pp.platform}`)
        .join('  ');

      message +=
        `📅 *${post.postType}*\n` +
        `_"${idea}"_\n` +
        `🕐 ${scheduledAt}\n` +
        `${platforms}\n` +
        `\`${post.id.slice(0, 8)}…\`\n\n`;
    }

    message += `─────────────────────\n\n`;
  }
  if (recent.length > 0) {
    message += `📊 *Recent Posts (${recent.length})*\n\n`;
    for (const post of recent) {
      const statusEmoji = POST_EMOJI[post.stats] ?? '❓';
      const idea = post.idea.length > 55 ? post.idea.slice(0, 55) + '…' : post.idea;
      const createdAt = formatInTz(post.createdAt, tz);
      message +=
        `${statusEmoji} *${post.postType}* — ${post.stats}\n` +
        `_"${idea}"_\n` +
        `🕐 ${createdAt}\n`;
      for (const pp of post.platformPosts) {
        const pEmoji = PLATFORM_EMOJI[pp.platform] ?? '📝';
        const jEmoji = JOB_EMOJI[pp.status] ?? '❓';
        message += `  ${pEmoji} ${pp.platform} ${jEmoji}`;
        if (pp.status === 'Failed' && pp.errorMessage) {
          message += ` — _${pp.errorMessage.slice(0, 40)}_`;
        }
        message += '\n';
      }

      message += '\n';
    }
  }
  message += `_/post to publish · /accounts to manage accounts_`;
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};
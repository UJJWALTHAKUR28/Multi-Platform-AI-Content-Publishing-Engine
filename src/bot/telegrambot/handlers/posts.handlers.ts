import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../../../db/prisma';
import { getSession, saveSession, clearSession, buildPublishAt, formatInTz, getNextDays, parseTimeInput, parseDateInput } from '../session.service';
import { generateContent } from '../../../services/ai/ai.service';
import { enqueuePublishJob } from '../../../queue/publish.queue';
import { prisma as db } from '../../../db/prisma';
const POST_TYPES = ['Announcement', 'Thread', 'Story', 'Promotional', 'Educational', 'Opinion',
] as const;
const PLATFORM_LABELS: Record<string, string> = {
  'Twitter/X': 'Twitter',
  'LinkedIn': 'Linkedin',
  'Instagram': 'Instagram',
  'Threads': 'Threads',
};
const PLATFORM_DISPLAY = Object.keys(PLATFORM_LABELS);
const ALL_PLATFORMS = Object.values(PLATFORM_LABELS);

const TONES = ['Professional', 'Casual', 'Witty', 'Authoritative', 'Friendly', 'Humorous'] as const;
const MODELS = [
  '🤖 GPT-4o (OpenAI)',
  '🧠 Claude (Anthropic)',
  '✨ Gemini (Google)',
] as const;

const PLATFORM_EMOJI: Record<string, string> = {
  Twitter: '🐦',
  Linkedin: '💼',
  Instagram: '📸',
  Threads: '🧵',
};
const POST_TYPE_DESC: Record<string, string> = {
  Announcement: '📢 News or updates',
  Thread: '🧵 Multi-part story',
  Story: '📖 Narrative post',
  Promotional: '🛍️ Sell or promote',
  Educational: '📚 Teach something',
  Opinion: '💬 Your take',
};
const makeKeyboard = (
  options: string[],
  columns: number = 2,
): TelegramBot.SendMessageOptions => ({
  reply_markup: {
    keyboard: options.reduce<TelegramBot.KeyboardButton[][]>((rows, opt, i) => {
      if (i % columns === 0) rows.push([]);
      rows[rows.length - 1].push({ text: opt });
      return rows;
    }, []),
    one_time_keyboard: true,
    resize_keyboard: true,
  },
});
const removeKeyboard = (): TelegramBot.SendMessageOptions => ({
  reply_markup: { remove_keyboard: true },
});
const safeSend = async (
  bot: TelegramBot,
  chatId: number,
  text: string,
  options: TelegramBot.SendMessageOptions = {},
): Promise<void> => {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err: any) {
    console.error(`[Bot] Send failed → ${chatId}:`, err?.message);
  }
};
export const handlePostFlow = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';

  if (!text) { await safeSend(bot, chatId, '📝 Please send a text message.'); return; }

  const session = await getSession(chatId);
  switch (session.step) {
    case 'IDLE': {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        select: { id: true, username: true, timezone: true },
      });
      if (user) {
        await saveSession(chatId, {
          step: 'POST_TYPE',
          userId: user.id,
          userName: user.username,
          timezone: user.timezone ?? 'UTC',
        });
        const typeRows = POST_TYPES.map(t => `${POST_TYPE_DESC[t]}  *${t}*`).join('\n');
        await safeSend(
          bot, chatId,
          `Hey *${user.username}* 👋\n\n` +
          `Let's create a post\\! What type?\n\n${typeRows}`,
          makeKeyboard([...POST_TYPES], 2),
        );
        return;
      }
      await saveSession(chatId, { step: 'AWAITING_EMAIL' });
      await safeSend(
        bot, chatId,
        `👋 *Welcome to Postly\\!*\n\n` +
        `I need to link your Telegram to your Postly account first\\.\n\n` +
        `Type the *email* you used to sign up:`,
        removeKeyboard(),
      );
      break;
    }
    case 'AWAITING_EMAIL': {
      const { initiateTelegramLink } = await import('../telegram-link.service');
      const email = text.toLowerCase().trim();
      if (!email.includes('@') || !email.includes('.')) {
        await safeSend(bot, chatId, `⚠️ That doesn't look like a valid email\\. Try again:`);
        return;
      }
      await safeSend(bot, chatId, `⏳ Sending code to *${email}*\\.\\.\\.`);
      try {
        await initiateTelegramLink(email, String(chatId));
        await saveSession(chatId, { step: 'AWAITING_OTP' });
        await safeSend(
          bot, chatId,
          `✅ Code sent\\!\n\nCheck your inbox and enter the *6\\-digit code*:\n_Expires in 5 minutes\\._`,
        );
      } catch (err: any) {
        await safeSend(bot, chatId, `❌ ${err.message}\n\nTry again — enter your email:`);
      }
      break;
    }
    case 'AWAITING_OTP': {
      const { verifyTelegramOtp } = await import('../telegram-link.service');
      const otp = text.trim();
      if (!/^\d{6}$/.test(otp)) {
        await safeSend(bot, chatId, `⚠️ Must be exactly 6 digits\\. Try again:`);
        return;
      }
      try {
        const username = await verifyTelegramOtp(otp, String(chatId));
        await clearSession(chatId);
        await safeSend(
          bot, chatId,
          `🎉 *Linked successfully, ${username}\\!*\n\nType /post to publish your first post\\.`,
        );
      } catch (err: any) {
        await safeSend(bot, chatId, `❌ ${err.message}`);
      }
      break;
    }
    case 'POST_TYPE': {
      if (!(POST_TYPES as readonly string[]).includes(text)) {
        await safeSend(
          bot, chatId,
          `⚠️ Please choose one of the options below:`,
          makeKeyboard([...POST_TYPES], 2),
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'PLATFORMS', postType: text });
      await safeSend(
        bot, chatId,
        `*${text}* ✅\n\nWhich platforms? Tap to select, then tap *Done*\\.`,
        makeKeyboard([...PLATFORM_DISPLAY, '🌐 All', '✅ Done'], 2),
      );
      break;
    }
    case 'PLATFORMS': {
      const clean = text.replace(/^✅\s*/, '').trim();
      let picked: string[] = session.platforms ?? [];

      if (clean === '🌐 All' || clean === 'All') {
        picked = [...ALL_PLATFORMS];
      } else if (clean === 'Done') {
        if (picked.length === 0) {
          await safeSend(bot, chatId, '⚠️ Select at least one platform first\\.', makeKeyboard([...PLATFORM_DISPLAY, '🌐 All'], 2));
          return;
        }
        await saveSession(chatId, { ...session, step: 'TONE', platforms: picked });
        const names = picked
          .map(p => `${PLATFORM_EMOJI[p]} ${p}`)
          .join('  ');
        await safeSend(
          bot, chatId,
          `Posting to: ${names}\n\nWhat *tone* should the content have?`,
          makeKeyboard([...TONES], 2),
        );
        return;
      } else {
        const enumVal = PLATFORM_LABELS[clean] ?? ALL_PLATFORMS.find(v => v === clean);
        if (enumVal) {
          picked = picked.includes(enumVal)
            ? picked.filter(p => p !== enumVal)
            : [...picked, enumVal];
        } else if (text.includes(',')) {
          const parsed = text.split(',')
            .map(s => PLATFORM_LABELS[s.trim()])
            .filter(Boolean) as string[];
          if (parsed.length > 0) {
            picked = [...new Set([...picked, ...parsed])];
          }
        }
      }

      await saveSession(chatId, { ...session, platforms: picked });

      const selectedNames = picked.length > 0
        ? picked.map(p => `${PLATFORM_EMOJI[p]} ${p}`).join('  ')
        : 'None yet';

      const keyboardOptions = PLATFORM_DISPLAY.map(p =>
        picked.includes(PLATFORM_LABELS[p]) ? `✅ ${p}` : p,
      );

      await safeSend(
        bot, chatId,
        `Selected: *${selectedNames}*\n\nTap more to add/remove, or *Done* to continue\\.`,
        makeKeyboard([...keyboardOptions, '🌐 All', '✅ Done'], 2),
      );
      break;
    }
    case 'TONE': {
      const toneMatch = TONES.find(t => t.toLowerCase() === text.toLowerCase());
      if (!toneMatch) {
        await safeSend(bot, chatId, `⚠️ Pick a tone from the options:`, makeKeyboard([...TONES], 2));
        return;
      }
      await saveSession(chatId, { ...session, step: 'MODEL', tone: toneMatch });
      await safeSend(
        bot, chatId,
        `*${toneMatch}* tone ✅\n\nWhich AI model should write the content?`,
        makeKeyboard([...MODELS], 1),
      );
      break;
    }
    case 'MODEL': {
      let model: 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | null = null;
      const t = text.toLowerCase();
      if (t.includes('gpt') || t.includes('openai')) model = 'OPENAI';
      if (t.includes('claude') || t.includes('anthropic')) model = 'ANTHROPIC';
      if (t.includes('gemini') || t.includes('google')) model = 'GEMINI';

      if (!model) {
        await safeSend(bot, chatId, `⚠️ Pick a model from the options:`, makeKeyboard([...MODELS], 1));
        return;
      }
      await saveSession(chatId, { ...session, step: 'IDEA', model });
      await safeSend(
        bot, chatId,
        `📝 *What's the idea or core message?*\n\n` +
        `_Give me the gist in a few sentences — I'll handle the platform\\-specific writing\\._\n` +
        `_(Max 500 characters)_`,
        removeKeyboard(),
      );
      break;
    }
    case 'IDEA': {
      if (text.length > 500) {
        await safeSend(
          bot, chatId,
          `⚠️ That's ${text.length} characters — please keep it under 500\\.\n_Tip: just give me the core idea\\._`,
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'CONFIRM', idea: text });
      await bot.sendChatAction(chatId, 'typing').catch(() => { });
      await safeSend(bot, chatId, `✍️ Generating content for *${session.platforms?.length}* platform(s)\\.\\.\\. _(~5–10s)_`);

      try {
        const result = await generateContent({
          idea: text,
          postType: session.postType!,
          platforms: session.platforms!,
          tone: session.tone!.toLowerCase(),
          language: 'en',
          model: session.model!,
          userId: session.userId!,
        });
        await saveSession(chatId, {
          ...session,
          step: 'WHEN',
          idea: text,
          generated: result.generated,
          modelUsed: result.modelUsed,
          tokensUsed: result.tokensUsed,
        });
        let preview = `✨ *Content preview:*\n\n`;
        for (const [platform, data] of Object.entries(result.generated)) {
          const emoji = PLATFORM_EMOJI[platform] ?? '📝';
          const display = Object.keys(PLATFORM_LABELS).find(k => PLATFORM_LABELS[k] === platform) ?? platform;
          const tags = data.hashtags.slice(0, 5).map(h => `#${h}`).join(' ');
          const limit = { Twitter: 280, Linkedin: 3000, Instagram: 2200, Threads: 500 }[platform] ?? 2200;
          const pct = Math.round((data.charCount / limit) * 100);
          const barFull = Math.round(pct / 10);
          const bar = '█'.repeat(barFull) + '░'.repeat(10 - barFull);
          preview +=
            `${emoji} *${display}*\n` +
            `${data.content}\n` +
            (tags ? `_${tags}_\n` : '') +
            `\`${bar}\` ${data.charCount}/${limit} chars\n\n`;
        }
        preview += `_${result.modelUsed} · ${result.tokensUsed} tokens_`;
        await safeSend(bot, chatId, preview);
        await safeSend(
          bot, chatId,
          `⏰ *When do you want to post this?*`,
          makeKeyboard(['🚀 Post Now', '📅 Schedule for Later', '✏️ Rewrite Idea', '❌ Cancel'], 2),
        );
      } catch (err: any) {
        await saveSession(chatId, { ...session, step: 'IDEA', idea: undefined });
        await safeSend(
          bot, chatId,
          `❌ Generation failed: _${err?.message ?? 'Unknown error'}_\n\nPlease try again — send your idea:`,
          removeKeyboard(),
        );
      }
      break;
    }
    case 'WHEN': {
      if (text === '❌ Cancel') {
        await clearSession(chatId);
        await safeSend(bot, chatId, `Cancelled\\. Type /post to start fresh\\.`, removeKeyboard());
        return;
      }
      if (text === '✏️ Rewrite Idea') {
        await saveSession(chatId, { ...session, step: 'IDEA', idea: undefined, generated: undefined });
        await safeSend(bot, chatId, `Send your updated idea:`, removeKeyboard());
        return;
      }
      if (text === '🚀 Post Now') {
        await saveSession(chatId, { ...session, step: 'CONFIRM', publishType: 'now' });
        await safeSend(
          bot, chatId,
          `Ready to publish immediately\\!`,
          {
            reply_markup: {
              keyboard: [
                [{ text: '✅ Confirm & Publish' }],
                [{ text: '✏️ Rewrite Idea' }],
                [{ text: '❌ Cancel' }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
        return;
      }
      if (text === '📅 Schedule for Later') {
        await saveSession(chatId, { ...session, step: 'SCHEDULE_DATE', publishType: 'schedule' });

        const tz = session.timezone ?? 'UTC';
        const days = getNextDays(tz, 7);
        await safeSend(
          bot, chatId,
          `📅 *Pick a date:*\n_Your timezone: ${tz}_`,
          makeKeyboard([...days.map(d => d.label), '📆 Enter date manually'], 1),
        );
        return;
      }
      await safeSend(
        bot, chatId,
        `Please tap one of the options below:`,
        makeKeyboard(['🚀 Post Now', '📅 Schedule for Later', '✏️ Rewrite Idea', '❌ Cancel'], 2),
      );
      break;
    }
    case 'SCHEDULE_DATE': {
      const tz = session.timezone ?? 'UTC';
      const days = getNextDays(tz, 7);
      const dayMatch = days.find(d => text.startsWith(d.label.split(' (')[0]) || text === d.label);
      let dateValue: string | null = null;
      if (dayMatch) {
        dateValue = dayMatch.value;
      } else if (text === '📆 Enter date manually') {
        await safeSend(
          bot, chatId,
          `📆 Type the date in any of these formats:\n` +
          `• \`25 Dec\`\n• \`25/12\`\n• \`25-12-2025\`\n• \`2025-12-25\``,
          removeKeyboard(),
        );
        return;
      } else {
        dateValue = parseDateInput(text, tz);
        if (!dateValue) {
          await safeSend(
            bot, chatId,
            `⚠️ Couldn't understand that date\\. Try "25 Dec" or "25/12/2025":`,
          );
          return;
        }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
        if (dateValue < today) {
          await safeSend(bot, chatId, `⚠️ That date is in the past\\. Pick a future date:`);
          return;
        }
      }
      await saveSession(chatId, { ...session, step: 'SCHEDULE_TIME', scheduleDate: dateValue });
      const friendlyDate = new Date(dateValue + 'T12:00:00Z').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      await safeSend(
        bot, chatId,
        `📅 *${friendlyDate}*\n\nNow pick a time:\n_All times in ${tz}_`,
        makeKeyboard([
          '🌅  9:00 AM', '☀️ 12:00 PM', '🌤  3:00 PM',
          '🌆  6:00 PM', '🌙  9:00 PM', '🕐 Custom time',
        ], 2),
      );
      break;
    }
    case 'SCHEDULE_TIME': {
      const tz = session.timezone ?? 'UTC';
      let timeValue: string | null = null;
      const QUICK_TIMES: Record<string, string> = {
        '🌅  9:00 AM': '09:00',
        '☀️ 12:00 PM': '12:00',
        '🌤  3:00 PM': '15:00',
        '🌆  6:00 PM': '18:00',
        '🌙  9:00 PM': '21:00',
      };

      if (text in QUICK_TIMES) {
        timeValue = QUICK_TIMES[text];
      } else if (text === '🕐 Custom time') {
        await safeSend(
          bot, chatId,
          `🕐 Type the time:\n• \`14:30\`\n• \`2:30 PM\`\n• \`9am\``,
          removeKeyboard(),
        );
        return;
      } else {
        timeValue = parseTimeInput(text);
        if (!timeValue) {
          await safeSend(
            bot, chatId,
            `⚠️ Couldn't parse that time\\. Try "14:30" or "2:30 PM":`,
          );
          return;
        }
      }
      const publishAt = buildPublishAt(session.scheduleDate!, timeValue, tz);
      if (publishAt <= new Date(Date.now() + 60_000)) {
        await safeSend(
          bot, chatId,
          `⚠️ That time is too soon or in the past\\. Pick a later time:`,
          makeKeyboard([
            '🌅  9:00 AM', '☀️ 12:00 PM', '🌤  3:00 PM',
            '🌆  6:00 PM', '🌙  9:00 PM', '🕐 Custom time',
          ], 2),
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'CONFIRM', scheduleTime: timeValue });
      const friendlyTime = formatInTz(publishAt, tz);
      await safeSend(
        bot, chatId,
        `🗓 *Scheduled for:*\n${friendlyTime}\n\nReady to confirm?`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '✅ Confirm & Schedule' }],
              [{ text: '🔄 Change Date/Time' }],
              [{ text: '✏️ Rewrite Idea' }],
              [{ text: '❌ Cancel' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        },
      );
      break;
    }
    case 'CONFIRM': {
      if (text === '❌ Cancel') {
        await clearSession(chatId);
        await safeSend(bot, chatId, `Cancelled\\. Type /post to start fresh\\.`, removeKeyboard());
        return;
      }
      if (text === '✏️ Rewrite Idea') {
        await saveSession(chatId, { ...session, step: 'IDEA', idea: undefined, generated: undefined });
        await safeSend(bot, chatId, `Send your updated idea:`, removeKeyboard());
        return;
      }
      if (text === '🔄 Change Date/Time') {
        const tz = session.timezone ?? 'UTC';
        const days = getNextDays(tz, 7);
        await saveSession(chatId, { ...session, step: 'SCHEDULE_DATE', scheduleDate: undefined, scheduleTime: undefined });
        await safeSend(
          bot, chatId,
          `📅 *Pick a new date:*`,
          makeKeyboard([...days.map(d => d.label), '📆 Enter date manually'], 1),
        );
        return;
      }
      const isConfirm = text === '✅ Confirm & Publish' || text === '✅ Confirm & Schedule';
      if (!isConfirm) {
        const isScheduled = session.publishType === 'schedule';
        await safeSend(bot, chatId, `Please tap one of the options below:`, {
          reply_markup: {
            keyboard: [
              [{ text: isScheduled ? '✅ Confirm & Schedule' : '✅ Confirm & Publish' }],
              ...(isScheduled ? [[{ text: '🔄 Change Date/Time' }]] : []),
              [{ text: '✏️ Rewrite Idea' }],
              [{ text: '❌ Cancel' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        return;
      }
      if (!session.generated || Object.keys(session.generated).length === 0) {
        await safeSend(bot, chatId, `Something went wrong with your session\\. Type /post to start again\\.`);
        await clearSession(chatId);
        return;
      }
      const isScheduled = session.publishType === 'schedule';
      const tz = session.timezone ?? 'UTC';
      let publishAt: Date | null = null;
      let delayMs = 0;
      if (isScheduled) {
        publishAt = buildPublishAt(session.scheduleDate!, session.scheduleTime!, tz);
        delayMs = Math.max(0, publishAt.getTime() - Date.now());
      }
      await safeSend(
        bot, chatId,
        isScheduled ? `📅 Scheduling your posts\\.\\.\\.` : `🚀 Publishing your posts\\.\\.\\.`,
        removeKeyboard(),
      );

      try {
        const post = await prisma.post.create({
          data: {
            userId: session.userId!,
            idea: session.idea!,
            postType: session.postType! as any,
            tone: session.tone!.toLowerCase(),
            modelused: session.modelUsed ?? session.model!,
            aiModel: session.model === 'OPENAI' ? 'OPENAI' : session.model === 'ANTHROPIC' ? 'ANTHROPIC' : 'GEMINI',
            tokensUsed: session.tokensUsed ?? 0,
            stats: 'Pending',
            publishAt: publishAt ?? null,
            bot: 'Telegram',
          },
        });
        const results: string[] = [];
        for (const [platform, data] of Object.entries(session.generated!)) {
          const pp = await prisma.platformPost.create({
            data: {
              postId: post.id,
              platform: platform as any,
              content: data.content,
              hashtages: data.hashtags,
              status: 'Queued',
              publishAt: publishAt ?? null,
            },
          });
          const jobId = await enqueuePublishJob(
            {
              platformPostId: pp.id,
              postId: post.id,
              userId: session.userId!,
              platform,
              content: data.content,
              hashtags: data.hashtags,
              publishAt: publishAt ? publishAt.toISOString() : null,
              retryCount: 0,
            },
            delayMs,
          );
          await prisma.platformPost.update({
            where: { id: pp.id },
            data: { bulljobId: jobId },
          });
          const displayName = Object.keys(PLATFORM_LABELS).find(k => PLATFORM_LABELS[k] === platform) ?? platform;
          results.push(`${PLATFORM_EMOJI[platform] ?? '📝'} ${displayName} — ${isScheduled ? 'scheduled' : 'queued'}`);
        }
        await prisma.post.update({
          where: { id: post.id },
          data: { stats: isScheduled ? 'Pending' : 'Processing' },
        });
        await clearSession(chatId);
        const resultText = results.join('\n');
        const scheduledAt = publishAt ? `\n\n🗓 *Scheduled for:* ${formatInTz(publishAt, tz)}` : '';
        await safeSend(
          bot, chatId,
          `${isScheduled ? '🗓' : '✅'} *${isScheduled ? 'Post scheduled!' : 'Posts queued successfully!'}*\n\n` +
          `${resultText}${scheduledAt}\n\n` +
          `Post ID: \`${post.id}\`\n\n` +
          `Use /status to track progress\\.`,
        );
      } catch (err: any) {
        console.error('[Bot] Publish/schedule failed:', err?.message);
        await safeSend(
          bot, chatId,
          `❌ Something went wrong:\n_${err?.message ?? 'Unknown error'}_\n\nType /post to try again\\.`,
        );
        await clearSession(chatId);
      }
      break;
    }
    default: {
      await clearSession(chatId);
      await safeSend(
        bot, chatId,
        `Session expired or got confused\\. Type /post to start fresh\\.`,
        removeKeyboard(),
      );
    }
  }
};
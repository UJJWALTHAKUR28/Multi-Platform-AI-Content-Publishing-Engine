import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../../../db/prisma';
import { getSession, saveSession, clearSession, } from '../session.service';
import { generateContent } from '../../../services/ai/ai.service';
import { enqueuePublishJob } from '../../../queue/publish.queue';
import { initiateTelegramLink, verifyTelegramOtp, } from '../telegram-link.service';
const POST_TYPES = [
  'Announcement',
  'Thread',
  'Story',
  'Promotional',
  'Educational',
  'Opinion',
] as const;
const PLATFORM_LABELS: Record<string, string> = {
  'Twitter/X': 'Twitter',
  'LinkedIn': 'Linkedin',
  'Instagram': 'Instagram',
  'Threads': 'Threads',
};
const PLATFORM_DISPLAY = Object.keys(PLATFORM_LABELS);
const ALL_PLATFORMS = Object.values(PLATFORM_LABELS);
const TONES = ['Professional', 'Casual', 'Witty', 'Authoritative', 'Friendly'] as const;
const MODELS = [
  'GPT-4o (OpenAI)',
  'Claude Sonnet (Anthropic)',
  'Gemini (Google)',
] as const;
const PLATFORM_EMOJI: Record<string, string> = {
  Twitter: '🐦',
  Linkedin: '💼',
  Instagram: '📸',
  Threads: '🧵',
};
const makeKeyboard = (
  options: string[],
  columns: number = 2,
): TelegramBot.SendMessageOptions => ({
  reply_markup: {
    keyboard: options.reduce<TelegramBot.KeyboardButton[][]>((rows: TelegramBot.KeyboardButton[][], opt: string, i: number) => {
      if (i % columns === 0) rows.push([]);
      rows[rows.length - 1].push({ text: opt });
      return rows;
    }, [] as TelegramBot.KeyboardButton[][]),
    one_time_keyboard: true,
    resize_keyboard: true,
  },
});
const removeKeyboard = (): TelegramBot.SendMessageOptions => ({
  reply_markup: { remove_keyboard: true },
});
const safeSend = async (bot: TelegramBot, chatId: number, text: string, options: TelegramBot.SendMessageOptions = {},): Promise<void> => {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err: any) {
    console.error(`[Bot] Failed to send message to ${chatId}:`, err?.message);
  }
};

export const handlePostFlow = async (bot: TelegramBot, msg: TelegramBot.Message,): Promise<void> => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';
  if (!text) {
    await safeSend(bot, chatId, '📝 Please send a text message.');
    return;
  }
  const session = await getSession(chatId);
  switch (session.step) {
    case 'IDLE': {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        select: { id: true, username: true },
      });
      if (user) {
        await saveSession(chatId, {
          step: 'POST_TYPE',
          userId: user.id,
          userName: user.username,
        });
        await safeSend(
          bot, chatId,
          `Hey *${user.username}* 👋\n\nWhat type of post is this?`,
          makeKeyboard([...POST_TYPES], 2),
        );
        return;
      }
      await saveSession(chatId, { step: 'AWAITING_EMAIL' });
      await safeSend(
        bot, chatId,
        `👋 *Welcome to Postly!*\n\n` +
        `To get started, I need to link your Telegram to your Postly account.\n\n` +
        `Please type the *email address* you used to sign up on Postly:`,
        removeKeyboard(),
      );
      break;
    }
    case 'AWAITING_EMAIL': {
      const email = text.toLowerCase().trim();
      if (!email.includes('@') || !email.includes('.')) {
        await safeSend(
          bot, chatId,
          `⚠️ That doesn't look like a valid email.\n\nPlease type your Postly account email:`,
        );
        return;
      }
      await safeSend(bot, chatId, `⏳ Sending verification code to *${email}*\\.\\.\\.`);
      try {
        await initiateTelegramLink(email, String(chatId));
        await saveSession(chatId, { step: 'AWAITING_OTP' });
        await safeSend(
          bot, chatId,
          `✅ Code sent\\!\n\n` +
          `Check your inbox and type the *6\\-digit code* here:\n\n` +
          `_Code expires in 5 minutes\\._`,
        );
      } catch (err: any) {
        await safeSend(
          bot, chatId,
          `❌ ${err.message}\n\nPlease type your email again:`,
        );
      }
      break;
    }
    case 'AWAITING_OTP': {
      const otp = text.trim();
      if (!/^\d{6}$/.test(otp)) {
        await safeSend(
          bot, chatId,
          `⚠️ The code should be exactly 6 digits.\n\nPlease check your email and try again:`,
        );
        return;
      }
      try {
        const username = await verifyTelegramOtp(otp, String(chatId));
        await clearSession(chatId);
        await safeSend(
          bot, chatId,
          `🎉 *Account linked successfully, ${username}\\!*\n\n` +
          `You can now use all Postly features from Telegram\\.\n\n` +
          `Type /post to publish your first post\\.`,
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
          `⚠️ Please pick one of the options below.`,
          makeKeyboard([...POST_TYPES], 2),
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'PLATFORMS', postType: text });
      await safeSend(
        bot, chatId,
        `Which platforms should I post to?\n\n` +
        `You can pick multiple — type comma\\-separated like:\n` +
        `\`Twitter/X, LinkedIn\`\n\n` +
        `Or tap *All* to post everywhere\\.`,
        makeKeyboard([...PLATFORM_DISPLAY, 'All'], 2),
      );
      break;
    }
    case 'PLATFORMS': {
      let picked: string[] = session.platforms ?? [];

      if (text === 'All') {
        picked = [...ALL_PLATFORMS];
      } else if (text === 'Done') {
        if (picked.length === 0) {
          await safeSend(bot, chatId, '⚠️ Please select at least one platform before clicking Done.');
          return;
        }
        // Move to TONE step
        await saveSession(chatId, { ...session, step: 'TONE', platforms: picked });
        const platformList = picked
          .map((p: string) => Object.keys(PLATFORM_LABELS).find((k) => PLATFORM_LABELS[k] === p) ?? p)
          .join(', ');
        await safeSend(
          bot, chatId,
          `Got it — posting to: *${platformList}*\n\nWhat tone should the content have?`,
          makeKeyboard([...TONES], 2),
        );
        return;
      } else {
        // Toggle logic
        const enumVal = PLATFORM_LABELS[text] || Object.values(PLATFORM_LABELS).find(v => v === text);
        if (enumVal) {
          if (picked.includes(enumVal)) {
            picked = picked.filter(p => p !== enumVal);
          } else {
            picked.push(enumVal);
          }
        } else {
          // Check if it was a comma separated list typed manually
          const raw = text.split(',').map((p: string) => p.trim());
          let foundAny = false;
          for (const label of raw) {
            const val = PLATFORM_LABELS[label];
            if (val && !picked.includes(val)) {
              picked.push(val);
              foundAny = true;
            }
          }

          if (!foundAny && picked.length === 0) {
            await safeSend(
              bot, chatId,
              `⚠️ I didn't recognize that platform\\.\n\n` +
              `Please tap the buttons to select platforms:`,
              makeKeyboard([...PLATFORM_DISPLAY, 'All'], 2),
            );
            return;
          }

          // If they typed a list, we can just proceed or stay
          if (foundAny && text.includes(',')) {
            // proceed to next step if they typed multiple
            await saveSession(chatId, { ...session, step: 'TONE', platforms: picked });
            const platformList = picked
              .map((p: string) => Object.keys(PLATFORM_LABELS).find((k) => PLATFORM_LABELS[k] === p) ?? p)
              .join(', ');
            await safeSend(
              bot, chatId,
              `Got it — posting to: *${platformList}*\n\nWhat tone should the content have?`,
              makeKeyboard([...TONES], 2),
            );
            return;
          }
        }
      }

      // If we are here, we are staying in the PLATFORMS step to allow more selection
      await saveSession(chatId, { ...session, platforms: picked });

      const currentSelection = picked.length > 0
        ? picked.map(p => PLATFORM_EMOJI[p] + ' ' + (Object.keys(PLATFORM_LABELS).find(k => PLATFORM_LABELS[k] === p) || p)).join(', ')
        : 'None';

      const keyboardOptions = PLATFORM_DISPLAY.map(p => {
        const isSelected = picked.includes(PLATFORM_LABELS[p]);
        return isSelected ? `✅ ${p}` : p;
      });

      await safeSend(
        bot, chatId,
        `Current selection: *${currentSelection}*\n\nTap more platforms to add/remove, or tap *Done* to continue\\.`,
        makeKeyboard([...keyboardOptions, 'All', '✅ Done'], 2),
      );
      break;
    }
    case 'TONE': {
      if (!(TONES as readonly string[]).includes(text)) {
        await safeSend(
          bot, chatId,
          `⚠️ Please pick a tone from the options\\.`,
          makeKeyboard([...TONES], 2),
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'MODEL', tone: text });
      await safeSend(
        bot, chatId,
        `*${text}* tone it is\\.\n\nWhich AI model should generate the content?`,
        makeKeyboard([...MODELS], 1),
      );
      break;
    }
    case 'MODEL': {
      let model: 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | null = null;
      if (text.includes('GPT') || text.includes('OpenAI')) model = 'OPENAI';
      if (text.includes('Claude') || text.includes('Anthropic')) model = 'ANTHROPIC';
      if (text.includes('Gemini') || text.includes('Google')) model = 'GEMINI';
      if (!model) {
        await safeSend(
          bot, chatId,
          `⚠️ Please pick a model from the options\\.`,
          makeKeyboard([...MODELS], 1),
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'IDEA', model });
      await safeSend(
        bot, chatId,
        `📝 Tell me the idea or core message\\.\n\n_Keep it under 500 characters — I'll handle the rest\\._`,
        removeKeyboard(),);
      break;
    }
    case 'IDEA': {
      if (text.length > 500) {
        await safeSend(
          bot, chatId,
          `⚠️ That's ${text.length} characters — please keep it under 500\\.\n\n` +
          `_Tip: give me the core idea, not the full post\\._`,
        );
        return;
      }
      await saveSession(chatId, { ...session, step: 'CONFIRM', idea: text });
      await bot.sendChatAction(chatId, 'typing').catch(() => { });
      await safeSend(bot, chatId, `Generating your content\\.\\.\\. ⚙️\n\n_This takes about 5–10 seconds\\._`);
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
          step: 'CONFIRM',
          idea: text,
          generated: result.generated,
          modelUsed: result.modelUsed,
          tokensUsed: result.tokensUsed,
        });
        let preview = `✨ *Here's your content:*\n\n`;
        for (const [platform, data] of Object.entries(result.generated)) {
          const emoji = PLATFORM_EMOJI[platform] ?? '📝';
          const display = Object.keys(PLATFORM_LABELS).find(
            (k) => PLATFORM_LABELS[k] === platform,
          ) ?? platform;
          const tags = data.hashtags.map((h) => `#${h}`).join(' ');

          preview +=
            `${emoji} *${display}* _\\(${data.charCount} chars\\)_\n` +
            `${data.content}\n` +
            (tags ? `${tags}\n` : '') +
            `\n`;
        }

        preview += `_Model: ${result.modelUsed} · ${result.tokensUsed} tokens_`;

        await safeSend(bot, chatId, preview, {
          reply_markup: {
            keyboard: [
              [{ text: '✅ Yes, Post Now' }],
              [{ text: '✏️ Edit Idea' }],
              [{ text: '❌ Cancel' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });

      } catch (err: any) {
        console.error('[Bot] AI generation failed:', err?.message);
        await saveSession(chatId, { ...session, step: 'IDEA', idea: undefined });
        await safeSend(
          bot, chatId,
          `❌ Generation failed: _${err?.message ?? 'Unknown error'}_\n\nPlease try again — send your idea:`,
          removeKeyboard(),
        );
      }
      break;
    }

    case 'CONFIRM': {

      if (text === '❌ Cancel') {
        await clearSession(chatId);
        await safeSend(
          bot, chatId,
          `Cancelled\\. 👋\n\nType /post whenever you're ready to create content\\.`,
          removeKeyboard(),
        );
        return;
      }

      if (text === '✏️ Edit Idea') {
        await saveSession(chatId, {
          ...session,
          step: 'IDEA',
          idea: undefined,
          generated: undefined,
        });
        await safeSend(
          bot, chatId,
          `No problem\\. Send me the updated idea:`,
          removeKeyboard(),
        );
        return;
      }

      if (text === '✅ Yes, Post Now') {
        if (!session.generated || Object.keys(session.generated).length === 0) {
          await safeSend(
            bot, chatId,
            `Something went wrong with your session\\. Please type /post to start again\\.`,
          );
          await clearSession(chatId);
          return;
        }

        await safeSend(bot, chatId, `🚀 Publishing your posts\\.\\.\\.`, removeKeyboard());

        try {
          const post = await prisma.post.create({
            data: {
              userId: session.userId!,
              idea: session.idea!,
              postType: session.postType! as any,
              tone: session.tone!.toLowerCase(),
              modelused: session.modelUsed ?? session.model!,
              aiModel: session.model === 'OPENAI'
                ? 'OPENAI'
                : session.model === 'ANTHROPIC'
                  ? 'ANTHROPIC'
                  : 'GEMINI',
              tokensUsed: session.tokensUsed ?? 0,
              stats: 'Pending',
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
                publishAt: null,
                retryCount: 0,
              },
              0,
            );

            await prisma.platformPost.update({
              where: { id: pp.id },
              data: { bulljobId: jobId },
            });

            const displayName =
              Object.keys(PLATFORM_LABELS).find((k) => PLATFORM_LABELS[k] === platform) ?? platform;
            results.push(`${PLATFORM_EMOJI[platform] ?? '📝'} ${displayName} — queued`);
          }

          await clearSession(chatId);

          const resultText = results.join('\n');
          await safeSend(
            bot, chatId,
            `✅ *Posts queued successfully\\!*\n\n${resultText}\n\n` +
            `Post ID: \`${post.id}\`\n\n` +
            `Use /status to track publishing progress\\.`,
          );

        } catch (err: any) {
          console.error('[Bot] Publish failed:', err?.message);
          await safeSend(
            bot, chatId,
            `❌ Something went wrong while publishing:\n_${err?.message ?? 'Unknown error'}_\n\nType /post to try again\\.`,
          );
          await clearSession(chatId);
        }
        return;
      }


      await safeSend(bot, chatId, `Please tap one of the buttons below\\.`, {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Yes, Post Now' }],
            [{ text: '✏️ Edit Idea' }],
            [{ text: '❌ Cancel' }],
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });
      break;
    }

    default: {
      await clearSession(chatId);
      await safeSend(
        bot, chatId,
        `Something went wrong with your session\\. Type /post to start fresh\\.`,
        removeKeyboard(),
      );
    }
  }
};
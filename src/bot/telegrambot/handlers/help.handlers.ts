import TelegramBot from 'node-telegram-bot-api';

export const handleHelp = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> => {
  const chatId = msg.chat.id;

  const message =
    `🤖 *Postly Bot — Commands*\n\n` +
    `*Publishing*\n` +
    `/post — Create and publish new content\n` +
    `/start — Same as /post\n\n` +
    `*Tracking*\n` +
    `/status — Show your last 5 posts and their status\n` +
    `/accounts — Show connected social accounts\n\n` +
    `*Other*\n` +
    `/help — Show this message\n` +
    `/cancel — Cancel current session\n\n` +
    `*How it works:*\n` +
    `1️⃣ Type /post\n` +
    `2️⃣ Pick post type, platforms, tone, and AI model\n` +
    `3️⃣ Give me your idea\n` +
    `4️⃣ Review the AI-generated preview\n` +
    `5️⃣ Confirm → posts go live\n\n` +
    `_Need help? Contact support via the dashboard._`;

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};

export const handleCancel = async (
  bot:     TelegramBot,
  msg:     TelegramBot.Message,
  clearFn: (chatId: number) => Promise<void>
): Promise<void> => {
  const chatId = msg.chat.id;
  await clearFn(chatId);
  await bot.sendMessage(
    chatId,
    `✅ Session cleared. Type /post to start fresh.`,
    { reply_markup: { remove_keyboard: true } }
  );
};
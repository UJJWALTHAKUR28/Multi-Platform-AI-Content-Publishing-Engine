import TelegramBot from 'node-telegram-bot-api';

export const handleHelp = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> => {
  const chatId = msg.chat.id;

  const message =
    `🤖 *Postly Bot — Commands*\n\n` +

    `*✍️ Publishing*\n` +
    `/post — Create and publish or schedule new content\n` +
    `/start — Same as /post\n\n` +

    `*📊 Tracking*\n` +
    `/status — Your recent posts + upcoming scheduled posts\n` +
    `/accounts — Connected social accounts\n\n` +

    `*⚙️ Other*\n` +
    `/help — Show this message\n` +
    `/cancel — Clear current session\n\n` +

    `*How it works:*\n` +
    `1️⃣ /post — pick post type\n` +
    `2️⃣ Choose platforms (Twitter, LinkedIn, Instagram, Threads)\n` +
    `3️⃣ Set tone and AI model\n` +
    `4️⃣ Give me your idea\n` +
    `5️⃣ Review the generated preview\n` +
    `6️⃣ *Publish Now* or *Schedule for Later* 🗓\n` +
    `   If scheduling: pick date → pick time → confirm\n\n` +

    `*📅 Scheduling tips:*\n` +
    `• Choose from the next 7 days or type any date\n` +
    `• Times are in your profile timezone\n` +
    `• Check /status to see scheduled posts\n` +
    `• Update timezone in your Postly dashboard\n\n` +

    `_Need help? Visit your Postly dashboard._`;

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};

export const handleCancel = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  clearFn: (chatId: number) => Promise<void>,
): Promise<void> => {
  const chatId = msg.chat.id;
  await clearFn(chatId);
  await bot.sendMessage(
    chatId,
    `✅ Session cleared.\n\nType /post to start fresh.`,
    { reply_markup: { remove_keyboard: true } },
  );
};
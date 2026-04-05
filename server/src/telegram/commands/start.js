import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { mainKeyboard, guestKeyboard } from '../keyboards.js';
import User from '../../models/User.js';
import config from '../../config/index.js';

/**
 * Generate a one-time login code for the given user and return the website login URL.
 */
async function generateLoginLink(user) {
  const code = crypto.randomUUID();
  const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  user.telegramLoginCode = code;
  user.telegramLoginCodeExpiry = expiry;
  await user.save();

  return `${config.frontendUrl}/tglogin?user_id=${user._id}&code=${code}`;
}

/**
 * Find or auto-create a user for the given Telegram chat, then send a website login link.
 */
async function findOrCreateAndSendLink(ctx) {
  const chatId = String(ctx.from.id);
  let user = await User.findOne({ telegramChatId: chatId });

  if (!user) {
    // Check for a previously unlinked account by permanent telegramUserId
    user = await User.findOne({ telegramUserId: chatId, telegramChatId: null });

    if (user) {
      // Re-link the old account
      user.telegramChatId = chatId;
      if (ctx.from.username) {
        user.telegram_username = `@${ctx.from.username}`;
      }
      await user.save();
    } else {
      // Auto-create account
      const telegramName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Telegram User';
      const telegramUsername = ctx.from.username || null;
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const placeholderEmail = `tg_${chatId}_${randomSuffix}@telegram.local`;
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = await User.create({
        name: telegramName,
        email: placeholderEmail,
        password: hashedPassword,
        telegramUserId: chatId,
        telegramChatId: chatId,
        telegram_username: telegramUsername ? `@${telegramUsername}` : null,
      });
    }

    ctx.dbUser = user;
  }

  const loginUrl = await generateLoginLink(user);

  return ctx.reply(
    `👋 Welcome, ${user.name}!\n\n`
    + `💰 Balance: $${user.balance.toFixed(2)}\n\n`
    + `🌐 Login to Website:\n${loginUrl}`,
    { reply_markup: mainKeyboard }
  );
}

export function setupStartCommand(bot) {
  bot.start(async (ctx) => {
    try {
      await findOrCreateAndSendLink(ctx);
    } catch (err) {
      console.error('[Telegram] Start command error:', err.message);
      ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
    }
  });

  bot.help((ctx) => {
    if (ctx.dbUser) {
      return ctx.reply(
        '📖 *Available Commands*\n\n'
        + '*Email Rentals:*\n'
        + '/shortterm — Get a short\\-term email\n'
        + '/longterm — Rent a long\\-term email\n'
        + '/rentals — View active rentals\n'
        + '/inbox — Check email inbox\n\n'
        + '*Account:*\n'
        + '/account — View account info\n'
        + '/deposit — Request a deposit\n'
        + '/pricing — View platform prices\n'
        + '/unlink — Unlink Telegram from website account\n\n'
        + '*Actions \\(during rental\\):*\n'
        + '/release — Release email \\(get refund if unused\\)\n'
        + '/ban — Ban a bad email \(refund\)',
        { parse_mode: 'MarkdownV2', reply_markup: mainKeyboard }
      );
    }

    return ctx.reply(
      '📖 *Getting Started*\n\n'
      + '/register — Create a new account\n'
      + '/link CODE — Link existing website account\n'
      + '/pricing — View platform prices\n'
      + '/help — Show this message',
      { parse_mode: 'MarkdownV2', reply_markup: guestKeyboard }
    );
  });
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

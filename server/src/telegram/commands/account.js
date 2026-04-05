import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { mainKeyboard, guestKeyboard } from '../keyboards.js';

export function setupAccountCommands(bot) {
  // /register — Create or re-link a Telegram-only account
  bot.command('register', async (ctx) => {
    if (ctx.dbUser) {
      return ctx.reply('✅ You already have an account linked to this Telegram.');
    }

    const chatId = String(ctx.from.id);

    // Check if this chat ID is already linked
    const existing = await User.findOne({ telegramChatId: chatId });
    if (existing) {
      ctx.dbUser = existing;
      return ctx.reply('✅ You already have an account!', { reply_markup: mainKeyboard });
    }

    // Check for a previously unlinked account by permanent telegramUserId
    const previousAccount = await User.findOne({ telegramUserId: chatId, telegramChatId: null });

    if (previousAccount) {
      // Re-link the old account
      previousAccount.telegramChatId = chatId;
      if (ctx.from.username) {
        previousAccount.telegram_username = `@${ctx.from.username}`;
      }
      await previousAccount.save();
      ctx.dbUser = previousAccount;

      return ctx.reply(
        '🎉 Welcome back! Your account has been re-linked.\n\n'
        + `👤 Name: ${previousAccount.name}\n`
        + `💰 Balance: $${previousAccount.balance.toFixed(2)}\n\n`
        + 'Use the keyboard below to get started!',
        { reply_markup: mainKeyboard }
      );
    }

    const telegramName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Telegram User';
    const telegramUsername = ctx.from.username || null;

    // Generate a random email and password for the account (user can set real ones later via website)
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const placeholderEmail = `tg_${chatId}_${randomSuffix}@telegram.local`;
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    const user = await User.create({
      name: telegramName,
      email: placeholderEmail,
      password: hashedPassword,
      telegramUserId: chatId,
      telegramChatId: chatId,
      telegram_username: telegramUsername ? `@${telegramUsername}` : null,
    });

    ctx.dbUser = user;

    return ctx.reply(
      '🎉 Account created successfully!\n\n'
      + `👤 Name: ${telegramName}\n`
      + `💰 Balance: $0.00\n\n`
      + 'You can now use all features through Telegram.\n\n'
      + 'Use the keyboard below to get started!',
      { reply_markup: mainKeyboard }
    );
  });

  // /link <CODE> — Link existing website account to this Telegram
  bot.hears(/^\/link(?:@\S+)?(?:\s+(.+))?$/i, async (ctx) => {
    const code = ctx.match?.[1]?.trim();
    if (!code) {
      if (ctx.dbUser) {
        return ctx.reply(
          'You are already linked to a website account.'
        );
      }
      return ctx.reply(
        '🔗 <b>Link your website account</b>\n\n'
        + 'If you don\'t have website account:\n'
        + 'Send /start and log in to the website\n\n'
        + 'If you already have an account:\n'
        + '1. Go to your Profile on the website\n'
        + '2. Click "Link Telegram"\n'
        + '3. Copy the code\n'
        + '4. Send the code here:\n\n'
        + '/link YOUR_CODE',
        { parse_mode: 'HTML' }
      );
    }

    // If user already has a real (non-placeholder) website account linked, block
    if (ctx.dbUser && !ctx.dbUser.email?.endsWith('@telegram.local')) {
      return ctx.reply(
        '⚠️ Your Telegram is already linked to a website account.\n\n'
        + `👤 ${ctx.dbUser.name} (${ctx.dbUser.email})\n\n`
        + 'If you want to link a different account, unlink first from the website Profile page.'
      );
    }

    try {
      const chatId = String(ctx.from.id);
      const now = new Date();

      // Find website user with this link code that hasn't expired
      const websiteUser = await User.findOne({
        telegramLinkCode: code.toUpperCase(),
        telegramLinkCodeExpiry: { $gt: now },
        telegramChatId: null,
      });

      if (!websiteUser) {
        return ctx.reply('❌ Invalid or expired code. Please generate a new one from the website.');
      }

      // If this Telegram already has an auto-created placeholder account, remove it (merge into website account)
      if (ctx.dbUser && String(ctx.dbUser._id) !== String(websiteUser._id)) {
        const tgAccount = ctx.dbUser;
        if (tgAccount.email?.endsWith('@telegram.local')) {
          // Transfer balance from Telegram account to website account if any
          if (tgAccount.balance > 0) {
            websiteUser.balance += tgAccount.balance;
          }
          await User.findByIdAndDelete(tgAccount._id);
        } else {
          // Unlink Telegram from old account first
          await User.findByIdAndUpdate(tgAccount._id, {
            $set: { telegramChatId: null },
          });
        }
      }

      // Link the website account to this Telegram
      websiteUser.telegramUserId = chatId;
      websiteUser.telegramChatId = chatId;
      websiteUser.telegramLinkCode = null;
      websiteUser.telegramLinkCodeExpiry = null;
      if (ctx.from.username) {
        websiteUser.telegram_username = `@${ctx.from.username}`;
      }
      await websiteUser.save();

      ctx.dbUser = websiteUser;

      return ctx.reply(
        `🎉 Account linked successfully!\n\n`
        + `👤 Name: ${websiteUser.name}\n`
        + `📧 Email: ${websiteUser.email}\n`
        + `💰 Balance: $${websiteUser.balance.toFixed(2)}\n\n`
        + 'You can now use all features through Telegram!',
        { reply_markup: mainKeyboard }
      );
    } catch (err) {
      console.error('[Telegram] Link error:', err.message);
      return ctx.reply('⚠️ Failed to link account. Please try again.');
    }
  });

  // /account — View account info
  bot.command('account', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const user = await User.findById(ctx.dbUser._id);
    const activeShort = (user.active_rentals || []).filter(
      (r) => r.lock_type === 'short_term' && r.expires_at > new Date()
    ).length;
    const activeLong = (user.active_rentals || []).filter(
      (r) => r.lock_type === 'long_term' && r.expires_at > new Date()
    ).length;

    return ctx.reply(
      '👤 *Account Info*\n\n'
      + `Name: ${esc(user.name)}\n`
      + `Email: ${esc(user.email)}\n`
      + `Balance: *$${esc(user.balance.toFixed(2))}*\n`
      + `Active Short\\-Term: ${activeShort}\n`
      + `Active Long\\-Term: ${activeLong}\n`
      + `Total Active: ${activeShort + activeLong}`,
      { parse_mode: 'MarkdownV2' }
    );
  });

}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

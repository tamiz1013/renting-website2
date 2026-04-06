import config from '../../config/index.js';
import EmailInventory from '../../models/EmailInventory.js';
import User from '../../models/User.js';
import UsageLog from '../../models/UsageLog.js';
import Pricing from '../../models/Pricing.js';
import { generateLockToken, buildLockEvent } from '../../utils/helpers.js';
import RealtimeEmail from '../../models/RealtimeEmail.js';
import { requireAuth } from '../middleware/auth.js';
import { platformInlineKeyboard } from '../keyboards.js';

export function setupShortTermCommands(bot) {
  // /shortterm — Show available platforms to rent
  bot.command('shortterm', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const pricing = await Pricing.find({ enabled: true, platform: { $ne: '_long_term' } }).sort({ platform: 1 });
    if (pricing.length === 0) {
      return ctx.reply('❌ No platforms available right now.');
    }

    const platforms = pricing.map((p) => p.platform);
    const priceList = pricing.map((p) => `• ${p.platform}: $${p.short_term_price.toFixed(2)}`).join('\n');

    return ctx.reply(
      `📧 *Short\\-Term Email Rental*\n\n`
      + `Choose a platform \\(30 min\\):\n\n`
      + `${esc(priceList)}\n\n`
      + `💰 Your balance: *$${esc(ctx.dbUser.balance.toFixed(2))}*`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: platformInlineKeyboard(platforms, 'st_assign'),
      }
    );
  });

  // Handle platform selection for short-term
  bot.action(/^st_assign:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;

    const platform = ctx.match[1];
    const userId = ctx.dbUser._id;

    // Refresh user data
    const user = await User.findById(userId);

    // Check active count
    const activeCount = (user.active_rentals || []).filter(
      (r) => r.lock_type === 'short_term' && r.expires_at > new Date()
    ).length;
    if (activeCount >= config.maxActiveShortTerm) {
      return ctx.editMessageText(`❌ Maximum ${config.maxActiveShortTerm} active short-term rentals allowed.`);
    }

    // Check pricing
    const pricing = await Pricing.findOne({ platform, enabled: true });
    if (!pricing) {
      return ctx.editMessageText(`❌ Platform "${platform}" is not available.`);
    }

    if (user.balance < pricing.short_term_price) {
      return ctx.editMessageText(`❌ Insufficient balance. Need $${pricing.short_term_price.toFixed(2)}, have $${user.balance.toFixed(2)}.`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.shortTermDurationMs);
    const lockToken = generateLockToken();
    const userBannedEmails = user.banned_emails || [];

    // Atomic assignment
    const email = await EmailInventory.findOneAndUpdate(
      {
        lock_type: null,
        current_user: null,
        long_term_user: null,
        globally_banned: { $ne: true },
        [`platform_status.${platform}.available`]: true,
        [`platform_status.${platform}.banned`]: { $ne: true },
        ...(userBannedEmails.length > 0 ? { email_id: { $nin: userBannedEmails } } : {}),
      },
      {
        $set: {
          lock_type: 'short_term',
          lock_platform: platform,
          lock_acquired_at: now,
          lock_acquired_by: userId,
          lock_token: lockToken,
          current_user: userId,
          current_platform: platform,
          short_term_assigned_at: now,
          short_term_expires_at: expiresAt,
          short_term_otp_received: false,
          short_term_inbox_received: false,
          [`platform_status.${platform}.available`]: false,
          [`platform_status.${platform}.otp`]: [],
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('assign', 'short_term', platform, userId)],
            $slice: -50,
          },
        },
      },
      { new: true }
    );

    if (!email) {
      return ctx.editMessageText(`❌ No available email for "${platform}". Try again later.`);
    }

    // Atomically deduct balance (only if sufficient)
    const deducted = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: pricing.short_term_price } },
      {
        $inc: { balance: -pricing.short_term_price },
        $push: {
          active_rentals: {
            email_id: email.email_id,
            platform,
            expires_at: expiresAt,
            lock_type: 'short_term',
          },
        },
      },
    );

    // If balance deduction failed, roll back the email lock
    if (!deducted) {
      await EmailInventory.findOneAndUpdate(
        { _id: email._id, lock_token: lockToken },
        {
          $set: {
            lock_type: null, lock_platform: null, lock_acquired_at: null,
            lock_acquired_by: null, lock_token: null, current_user: null,
            current_platform: null, short_term_assigned_at: null,
            short_term_expires_at: null,
            [`platform_status.${platform}.available`]: true,
          },
        }
      );
      return ctx.editMessageText('❌ Insufficient balance');
    }

    await UsageLog.create({
      user_id: userId,
      email_id: email.email_id,
      action: 'short_term_assign',
      platform,
      lock_type: 'short_term',
      amount: pricing.short_term_price,
    });

    const expiresMin = Math.round(config.shortTermDurationMs / 60000);

    return ctx.editMessageText(
      `✅ Email assigned!\n\n`
      + `📧 Email: ${email.email_id}\n`
      + `🏷 Platform: ${platform}\n`
      + `💰 Price: $${pricing.short_term_price.toFixed(2)}\n`
      + `⏱ Expires in: ${expiresMin} minutes\n\n`
      + `Use /inbox to check for incoming messages.\n\n`
      + `When done:\n`
      + `• /release ${email.email_id} — Cancel (refund if no messages)\n`
      + `• /ban ${email.email_id} — Bad email (refund)`,
      { reply_markup: {
        inline_keyboard: [
          [
            { text: '📥 Check Inbox', callback_data: `poll:${email.email_id}` },
          ],
          [
            { text: '↩️ Release', callback_data: `st_release:${email.email_id}` },
          ],
          [
            { text: '🚫 Ban', callback_data: `st_ban:${email.email_id}` },
            { text: '📋 Report', callback_data: `st_report:${email.email_id}` },
          ],
        ],
      }}
    );
  });

  // /release <email_id> — Release short-term
  bot.command('release', async (ctx) => {
    if (!requireAuth(ctx)) return;
    const emailId = ctx.message.text.split(' ')[1]?.trim();
    if (!emailId) return ctx.reply('Usage: /release <email_id>');
    await handleRelease(ctx, emailId);
  });

  bot.action(/^st_release:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;
    await handleRelease(ctx, ctx.match[1]);
  });

  // /ban <email_id> — Ban short-term email
  bot.command('ban', async (ctx) => {
    if (!requireAuth(ctx)) return;
    const emailId = ctx.message.text.split(' ')[1]?.trim();
    if (!emailId) return ctx.reply('Usage: /ban <email_id>');
    await handleBan(ctx, emailId);
  });

  bot.action(/^st_ban:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;
    await handleBan(ctx, ctx.match[1]);
  });

  bot.action(/^st_report:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;
    await handleReport(ctx, ctx.match[1]);
  });
}

async function handleRelease(ctx, emailId, lockTokenOverride) {
  const userId = ctx.dbUser._id;

  const email = await EmailInventory.findOne({
    email_id: emailId, lock_type: 'short_term', current_user: userId,
  });

  if (!email) return replyOrEdit(ctx, '❌ Assignment not found or not owned by you.');

  const lockToken = lockTokenOverride || email.lock_token;
  const platform = email.current_platform;

  let inboxReceived = email.short_term_inbox_received || false;
  if (!inboxReceived && RealtimeEmail) {
    const sinceTime = email.short_term_assigned_at;
    const msgCount = await RealtimeEmail.countDocuments({
      $or: [
        { forwardedFrom: { $regex: emailId, $options: 'i' } },
        { emailAccount: { $regex: emailId, $options: 'i' } },
      ],
      ...(sinceTime ? { createdAt: { $gte: sinceTime } } : {}),
    });
    inboxReceived = msgCount > 0;
  }

  const platformAvailUpdate = inboxReceived ? {} : { [`platform_status.${platform}.available`]: true };

  await EmailInventory.findOneAndUpdate(
    { email_id: emailId, lock_token: lockToken },
    {
      $set: {
        lock_type: null, lock_platform: null,
        lock_acquired_at: null, lock_acquired_by: null, lock_token: null,
        current_user: null, current_platform: null,
        short_term_assigned_at: null, short_term_expires_at: null,
        short_term_otp_received: false, short_term_inbox_received: false,
        ...platformAvailUpdate,
      },
      $push: {
        lock_events: {
          $each: [buildLockEvent('release', 'short_term', platform, userId, { refunded: !inboxReceived, inbox_received: inboxReceived })],
          $slice: -50,
        },
      },
    }
  );

  let refundAmount = 0;
  if (!inboxReceived) {
    const pricing = await Pricing.findOne({ platform });
    refundAmount = pricing?.short_term_price || 0;
  }

  await User.findByIdAndUpdate(userId, {
    ...(refundAmount > 0 ? { $inc: { balance: refundAmount } } : {}),
    $pull: { active_rentals: { email_id: emailId } },
  });

  await UsageLog.create({
    user_id: userId, email_id: emailId,
    action: 'short_term_release', platform, lock_type: 'short_term',
    amount: refundAmount, meta: { refunded: !inboxReceived, inbox_received: inboxReceived },
  });

  const msg = inboxReceived
    ? `↩️ Released ${emailId} (no refund — inbox had messages).`
    : `↩️ Released ${emailId}. Refunded $${refundAmount.toFixed(2)}.`;

  return replyOrEdit(ctx, msg);
}

async function handleBan(ctx, emailId, lockTokenOverride) {
  const userId = ctx.dbUser._id;

  const email = await EmailInventory.findOne({
    email_id: emailId, lock_type: 'short_term', current_user: userId,
    short_term_otp_received: false,
  });

  if (!email) return replyOrEdit(ctx, '❌ Assignment not found, not owned, or OTP already received.');

  const lockToken = lockTokenOverride || email.lock_token;
  const platform = email.current_platform;

  const banUpdate = await EmailInventory.findOneAndUpdate(
    { email_id: emailId, lock_token: lockToken },
    {
      $set: {
        lock_type: null, lock_platform: null,
        lock_acquired_at: null, lock_acquired_by: null, lock_token: null,
        current_user: null, current_platform: null,
        short_term_assigned_at: null, short_term_expires_at: null,
        short_term_otp_received: false, short_term_inbox_received: false,
        [`platform_status.${platform}.banned`]: true,
        [`platform_status.${platform}.available`]: false,
      },
      $push: {
        ban_records: { user_id: userId, platform, lock_type: 'short_term', at: new Date() },
        lock_events: {
          $each: [buildLockEvent('ban', 'short_term', platform, userId)],
          $slice: -50,
        },
      },
    },
    { new: true }
  );

  await User.findByIdAndUpdate(userId, { $addToSet: { banned_emails: emailId } });

  if (banUpdate) {
    const distinctBanners = new Set(banUpdate.ban_records.map((r) => r.user_id.toString()));
    if (distinctBanners.size >= 3 && !banUpdate.globally_banned) {
      await EmailInventory.findByIdAndUpdate(banUpdate._id, { $set: { globally_banned: true } });
    }
  }

  const pricing = await Pricing.findOne({ platform });
  const refundAmount = pricing?.short_term_price || 0;

  await User.findByIdAndUpdate(userId, {
    $inc: { balance: refundAmount },
    $pull: { active_rentals: { email_id: emailId } },
  });

  await UsageLog.create({
    user_id: userId, email_id: emailId,
    action: 'short_term_ban', platform, lock_type: 'short_term',
    amount: refundAmount, meta: { refunded: true },
  });

  return replyOrEdit(ctx, `🚫 Email banned and refunded $${refundAmount.toFixed(2)}.`);
}

async function handleReport(ctx, emailId) {
  const userId = ctx.dbUser._id;

  const email = await EmailInventory.findOne({
    email_id: emailId, lock_type: 'short_term', current_user: userId,
  });

  if (!email) return replyOrEdit(ctx, '❌ Assignment not found or not owned by you.');

  if (!email.short_term_inbox_received) {
    return replyOrEdit(ctx, '❌ There is nothing to report. You may ban it if it is not working for you.');
  }

  await EmailInventory.findByIdAndUpdate(email._id, {
    $inc: { problem_count: 1 },
    $push: {
      reports: { user_id: userId, lock_type: 'short_term', platform: email.current_platform, at: new Date() },
    },
  });

  await UsageLog.create({
    user_id: userId, email_id: emailId,
    action: 'report', platform: email.current_platform, lock_type: 'short_term',
  });

  return replyOrEdit(ctx, '📋 Report submitted. Admin will review it.');
}

function replyOrEdit(ctx, text) {
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text);
  }
  return ctx.reply(text);
}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

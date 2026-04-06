import config from '../../config/index.js';
import EmailInventory from '../../models/EmailInventory.js';
import User from '../../models/User.js';
import UsageLog from '../../models/UsageLog.js';
import Pricing from '../../models/Pricing.js';
import { generateLockToken, buildLockEvent } from '../../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { durationInlineKeyboard } from '../keyboards.js';

export function setupLongTermCommands(bot) {
  // /longterm — Show long-term rental options
  bot.command('longterm', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const ltPricing = await Pricing.findOne({ platform: '_long_term', enabled: true });
    if (!ltPricing) {
      return ctx.reply('❌ Long-term pricing is not configured.');
    }

    return ctx.reply(
      `📬 *Long\\-Term Email Rental*\n\n`
      + `You get a dedicated email for all platforms\\.\n\n`
      + `Pricing:\n`
      + `• 7 Days: $${esc(ltPricing.long_term_7d_price.toFixed(2))}\n`
      + `• 1 Month: $${esc(ltPricing.long_term_1m_price.toFixed(2))}\n`
      + `• 3 Months: $${esc(ltPricing.long_term_3m_price.toFixed(2))}\n\n`
      + `💰 Your balance: *$${esc(ctx.dbUser.balance.toFixed(2))}*`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: durationInlineKeyboard(),
      }
    );
  });

  // Handle duration selection
  bot.action(/^lt_assign:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;

    const duration = ctx.match[1]; // 7d, 1m, 3m
    const userId = ctx.dbUser._id;
    const user = await User.findById(userId);

    const ltPricing = await Pricing.findOne({ platform: '_long_term', enabled: true });
    if (!ltPricing) {
      return ctx.editMessageText('❌ Long-term pricing is not configured.');
    }

    const priceKey = `long_term_${duration}_price`;
    const price = ltPricing[priceKey];
    if (price == null) {
      return ctx.editMessageText(`❌ No pricing for duration "${duration}".`);
    }

    if (user.balance < price) {
      return ctx.editMessageText(`❌ Insufficient balance. Need $${price.toFixed(2)}, have $${user.balance.toFixed(2)}.`);
    }

    const now = new Date();
    const durationMs = config.longTermDurations[duration];
    const rentalExpiry = new Date(now.getTime() + durationMs);
    const lockToken = generateLockToken();
    const userBannedEmails = user.banned_emails || [];

    // Get previous long-term email IDs to exclude
    const previousLongTermLogs = await UsageLog.find(
      { user_id: userId, action: 'long_term_assign' },
      { email_id: 1 }
    ).lean();
    const previousLongTermIds = previousLongTermLogs.map((l) => l.email_id);
    const excludedEmailIds = [...new Set([...userBannedEmails, ...previousLongTermIds])];

    // Get all enabled platforms
    const pricingDocs = await Pricing.find({ platform: { $ne: '_long_term' }, enabled: { $ne: false } }).lean();
    const platforms = pricingDocs.map((p) => p.platform);

    const allPlatformAvailQuery = {};
    for (const plat of platforms) {
      allPlatformAvailQuery[`platform_status.${plat}.available`] = true;
      allPlatformAvailQuery[`platform_status.${plat}.banned`] = { $ne: true };
    }

    const email = await EmailInventory.findOneAndUpdate(
      {
        lock_type: null,
        current_user: null,
        long_term_user: null,
        globally_banned: { $ne: true },
        ...(excludedEmailIds.length > 0 ? { email_id: { $nin: excludedEmailIds } } : {}),
        ...allPlatformAvailQuery,
      },
      {
        $set: {
          lock_type: 'long_term',
          lock_platform: 'long_term',
          lock_acquired_at: now,
          lock_acquired_by: userId,
          lock_token: lockToken,
          long_term_user: userId,
          long_term_assigned_at: now,
          long_term_released_at: null,
          rental_expiry: rentalExpiry,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('assign', 'long_term', 'long_term', userId, { duration })],
            $slice: -50,
          },
        },
      },
      { new: true }
    );

    if (!email) {
      return ctx.editMessageText('❌ No available email for long-term rental. Try again later.');
    }

    // Atomic balance deduction with $gte guard
    const deducted = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: price } },
      {
        $inc: { balance: -price },
        $push: {
          active_rentals: {
            email_id: email.email_id,
            platform: 'long_term',
            expires_at: rentalExpiry,
            lock_type: 'long_term',
          },
        },
      },
      { new: true }
    );

    if (!deducted) {
      // Rollback: release the email lock
      await EmailInventory.findOneAndUpdate(
        { email_id: email.email_id, lock_token: lockToken },
        {
          $set: {
            lock_type: null, lock_token: null,
            lock_acquired_at: null, lock_acquired_by: null,
            long_term_user: null, long_term_assigned_at: null,
            long_term_released_at: null, rental_expiry: null,
          },
        }
      );
      return ctx.editMessageText('❌ Insufficient balance. The email has been released.');
    }

    await UsageLog.create({
      user_id: userId, email_id: email.email_id,
      action: 'long_term_assign', lock_type: 'long_term',
      amount: price, meta: { duration },
    });

    const durationLabel = { '7d': '7 Days', '1m': '1 Month', '3m': '3 Months' }[duration];
    const expiryStr = rentalExpiry.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return ctx.editMessageText(
      `✅ Long-term email assigned!\n\n`
      + `📧 Email: ${email.email_id}\n`
      + `⏱ Duration: ${durationLabel}\n`
      + `📅 Expires: ${expiryStr}\n`
      + `💰 Price: $${price.toFixed(2)}\n\n`
      + `Use /inbox to check messages.\n\n`
      + `• /lt_release ${email.email_id} — Release rental`,
      { reply_markup: {
        inline_keyboard: [
          [{ text: '📥 Check Inbox', callback_data: `messages:${email.email_id}` }],
          [
            { text: '↩️ Release', callback_data: `lt_release:${email.email_id}` },
            { text: '📋 Report', callback_data: `lt_report:${email.email_id}` },
          ],
        ],
      }}
    );
  });

  // /lt_release <email_id>
  bot.command('lt_release', async (ctx) => {
    if (!requireAuth(ctx)) return;
    const emailId = ctx.message.text.split(' ')[1]?.trim();
    if (!emailId) return ctx.reply('Usage: /lt_release <email_id>');
    await handleLtRelease(ctx, emailId);
  });

  bot.action(/^lt_release:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;
    await handleLtRelease(ctx, ctx.match[1]);
  });

  bot.action(/^lt_report:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!requireAuth(ctx)) return;

    const emailId = ctx.match[1];
    const userId = ctx.dbUser._id;
    const email = await EmailInventory.findOne({
      email_id: emailId, lock_type: 'long_term', long_term_user: userId,
    });
    if (!email) return ctx.editMessageText('❌ Long-term rental not found or not owned by you.');

    await EmailInventory.findByIdAndUpdate(email._id, {
      $inc: { problem_count: 1 },
      $push: {
        reports: { user_id: userId, lock_type: 'long_term', platform: null, at: new Date() },
      },
    });

    await UsageLog.create({
      user_id: userId, email_id: emailId,
      action: 'report', lock_type: 'long_term',
    });

    return ctx.editMessageText('📋 Report submitted. Admin will review it.');
  });
}

async function handleLtRelease(ctx, emailId) {
  const userId = ctx.dbUser._id;

  const email = await EmailInventory.findOne({
    email_id: emailId, lock_type: 'long_term', long_term_user: userId,
  });
  if (!email) return replyOrEdit(ctx, '❌ Long-term rental not found or not owned by you.');

  await EmailInventory.findOneAndUpdate(
    { email_id: emailId, lock_type: 'long_term', long_term_user: userId },
    {
      $set: {
        lock_type: null, lock_platform: null,
        lock_acquired_at: null, lock_acquired_by: null, lock_token: null,
        long_term_user: null, long_term_assigned_at: null,
        long_term_released_at: new Date(), rental_expiry: null,
      },
      $push: {
        lock_events: {
          $each: [buildLockEvent('release', 'long_term', 'long_term', userId)],
          $slice: -50,
        },
      },
    }
  );

  await User.findByIdAndUpdate(userId, { $pull: { active_rentals: { email_id: emailId } } });
  await UsageLog.create({
    user_id: userId, email_id: emailId, action: 'long_term_release', lock_type: 'long_term',
  });

  return replyOrEdit(ctx, `↩️ Long-term rental released for ${emailId}.`);
}

function replyOrEdit(ctx, text) {
  if (ctx.callbackQuery) return ctx.editMessageText(text);
  return ctx.reply(text);
}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

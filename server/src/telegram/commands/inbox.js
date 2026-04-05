import RealtimeEmail from '../../models/RealtimeEmail.js';
import EmailInventory from '../../models/EmailInventory.js';
import Pricing from '../../models/Pricing.js';
import { matchesPlatform, normalizeMessage } from '../../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import User from '../../models/User.js';

const MESSAGES_PER_PAGE = 3;

export function setupInboxCommands(bot) {
  // /inbox — Show active rentals to check inbox
  bot.command('inbox', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const user = await User.findById(ctx.dbUser._id);
    const now = new Date();
    const activeRentals = (user.active_rentals || []).filter((r) => r.expires_at > now);

    if (activeRentals.length === 0) {
      return ctx.reply('📭 No active rentals. Use /shortterm or /longterm to get one.');
    }

    const buttons = activeRentals.map((r) => {
      const type = r.lock_type === 'short_term' ? 'short-term' : 'long-term';
      const label = `${type}: ${r.email_id}`;
      const action = r.lock_type === 'short_term' ? 'poll' : 'messages';
      return [{ text: label, callback_data: `${action}:${r.email_id}` }];
    });

    return ctx.reply(
      '📥 *Your Active Emails*\n\nTap to check inbox:',
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: buttons } }
    );
  });

  // Handle short-term inbox poll (with optional page)
  bot.action(/^poll:(.+?)(?::p(\d+))?$/, async (ctx) => {
    await ctx.answerCbQuery('Checking inbox...');
    if (!requireAuth(ctx)) return;
    const page = parseInt(ctx.match[2] || '1', 10);
    await pollInbox(ctx, ctx.match[1], page);
  });

  // Handle long-term inbox messages (with optional page)
  bot.action(/^messages:(.+?)(?::p(\d+))?$/, async (ctx) => {
    await ctx.answerCbQuery('Loading messages...');
    if (!requireAuth(ctx)) return;
    const page = parseInt(ctx.match[2] || '1', 10);
    await getMessages(ctx, ctx.match[1], page);
  });

  // /rentals — View all active rentals with actions
  bot.command('rentals', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const userId = ctx.dbUser._id;
    const now = new Date();

    const shortTermEmails = await EmailInventory.find({
      lock_type: 'short_term', current_user: userId,
    }).select('email_id current_platform short_term_expires_at');

    const longTermEmails = await EmailInventory.find({
      lock_type: 'long_term', long_term_user: userId,
    }).select('email_id rental_expiry');

    if (shortTermEmails.length === 0 && longTermEmails.length === 0) {
      return ctx.reply('📭 No active rentals.');
    }

    let text = '📋 *Active Rentals*\n\n';
    const buttons = [];

    if (shortTermEmails.length > 0) {
      text += '*Short\\-Term:*\n';
      for (const e of shortTermEmails) {
        const remaining = Math.max(0, Math.round((e.short_term_expires_at - now) / 60000));
        text += `short\\-term: ${esc(e.email_id)}\n   Platform: ${esc(e.current_platform)} \\| ⏱ ${remaining}m left\n\n`;
        buttons.push([
          { text: `Inbox: ${e.email_id}`, callback_data: `poll:${e.email_id}` },
        ]);
        buttons.push([
          { text: '↩️ Release', callback_data: `st_release:${e.email_id}` },
          { text: '🚫 Ban', callback_data: `st_ban:${e.email_id}` },
          { text: '📋 Report', callback_data: `st_report:${e.email_id}` },
        ]);
      }
    }

    if (longTermEmails.length > 0) {
      text += '*Long\\-Term:*\n';
      for (const e of longTermEmails) {
        const expiryStr = e.rental_expiry
          ? e.rental_expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'N/A';
        text += `long\\-term: ${esc(e.email_id)}\n   Expires: ${esc(expiryStr)}\n\n`;
        buttons.push([
          { text: `Inbox: ${e.email_id}`, callback_data: `messages:${e.email_id}` },
        ]);
        buttons.push([
          { text: '↩️ Release', callback_data: `lt_release:${e.email_id}` },
          { text: '📋 Report', callback_data: `lt_report:${e.email_id}` },
        ]);
      }
    }

    return ctx.reply(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: buttons },
    });
  });
}

async function pollInbox(ctx, emailId, page = 1) {
  const userId = ctx.dbUser._id;

  let email = await EmailInventory.findOne({
    email_id: emailId,
    $or: [
      { lock_type: 'short_term', current_user: userId },
      { lock_type: 'long_term', long_term_user: userId },
    ],
  });

  if (!email) {
    return ctx.editMessageText('❌ You do not have access to this email.');
  }

  if (!RealtimeEmail) {
    return ctx.editMessageText('❌ Realtime inbox not configured.');
  }

  const platform = email.lock_type === 'short_term' ? email.current_platform : null;
  const sinceTime = email.lock_type === 'short_term'
    ? email.short_term_assigned_at
    : email.long_term_assigned_at;

  const query = {
    $or: [
      { forwardedFrom: { $regex: emailId, $options: 'i' } },
      { emailAccount: { $regex: emailId, $options: 'i' } },
    ],
  };
  if (sinceTime) query.createdAt = { $gte: sinceTime };

  const rawMessages = await RealtimeEmail.find(query).sort({ emailTime: -1 }).limit(50).lean();

  let messages = rawMessages;
  if (platform) {
    messages = rawMessages.filter((msg) => {
      const textToCheck = [msg.platform, msg.senderName, msg.subject].filter(Boolean).join(' ');
      return matchesPlatform(platform, textToCheck);
    });
  }

  const normalized = messages.map((msg) => normalizeMessage(msg, platform));

  // Mark inbox received for short-term
  if (email.lock_type === 'short_term' && normalized.length > 0 && !email.short_term_inbox_received) {
    await EmailInventory.findByIdAndUpdate(email._id, { $set: { short_term_inbox_received: true } });
  }

  if (normalized.length === 0) {
    const refreshBtn = email.lock_type === 'short_term'
      ? [{ text: '🔄 Refresh', callback_data: `poll:${emailId}` }]
      : [{ text: '🔄 Refresh', callback_data: `messages:${emailId}` }];

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return safeEdit(ctx,
      `📭 No messages yet for ${emailId}.\n\nKeep checking — messages appear in real-time.\n🕐 Last checked: ${timeStr}`,
      { reply_markup: { inline_keyboard: [refreshBtn] } }
    );
  }

  // Paginate messages
  const totalPages = Math.ceil(normalized.length / MESSAGES_PER_PAGE);
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  const start = (page - 1) * MESSAGES_PER_PAGE;
  const pageMessages = normalized.slice(start, start + MESSAGES_PER_PAGE);

  let text = `📥 Inbox for ${emailId} (${normalized.length} messages)\n`;
  text += `Page ${page} of ${totalPages}\n\n`;

  for (const msg of pageMessages) {
    if (msg.hasCode) {
      text += `🔑 OTP: ${msg.code}\n`;
    }
    if (msg.subject) text += `📝 ${msg.subject}\n`;
    if (msg.senderName) text += `👤 ${msg.senderName}\n`;
    if (msg.time) {
      const timeStr = new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      text += `🕐 ${timeStr}\n`;
    }
    if (msg.body && !msg.hasCode) {
      const bodyPreview = msg.body.length > 150 ? msg.body.substring(0, 150) + '...' : msg.body;
      text += `${bodyPreview}\n`;
    }
    text += '\n———————————\n\n';
  }

  const refreshAction = email.lock_type === 'short_term' ? 'poll' : 'messages';
  const navButtons = [];
  if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `${refreshAction}:${emailId}:p${page - 1}` });
  navButtons.push({ text: '🔄 Refresh', callback_data: `${refreshAction}:${emailId}:p${page}` });
  if (page < totalPages) navButtons.push({ text: 'Next ➡️', callback_data: `${refreshAction}:${emailId}:p${page + 1}` });

  return safeEdit(ctx, text, {
    reply_markup: {
      inline_keyboard: [navButtons],
    },
  });
}

async function getMessages(ctx, emailId, page = 1) {
  const userId = ctx.dbUser._id;

  let email = await EmailInventory.findOne({
    email_id: emailId, lock_type: 'long_term', long_term_user: userId,
  });

  let isFallback = false;
  if (!email) {
    const user = await User.findById(userId);
    const now = new Date();
    const activeRental = (user.active_rentals || []).find(
      (r) => r.email_id === emailId && r.lock_type === 'long_term' && r.expires_at > now
    );
    if (activeRental) {
      isFallback = true;
      email = { email_id: emailId, lock_type: 'long_term' };
    }
  }

  if (!email) return ctx.editMessageText('❌ You do not have access to this email.');
  if (!RealtimeEmail) return ctx.editMessageText('❌ Realtime inbox not configured.');

  const localPart = emailId.split('@')[0];
  const query = {
    $or: [
      { forwardedFrom: { $regex: emailId, $options: 'i' } },
      { emailAccount: { $regex: emailId, $options: 'i' } },
      { forwardedFrom: { $regex: localPart, $options: 'i' } },
      { emailAccount: { $regex: localPart, $options: 'i' } },
    ],
  };

  const rawMessages = await RealtimeEmail.find(query).sort({ emailTime: -1 }).limit(200).lean();
  const normalized = rawMessages.map((msg) => normalizeMessage(msg));

  if (normalized.length === 0) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return safeEdit(ctx,
      `📭 No messages for ${emailId}.\n🕐 Last checked: ${timeStr}`,
      { reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `messages:${emailId}` }]] } }
    );
  }

  const totalPages = Math.ceil(normalized.length / MESSAGES_PER_PAGE);
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  const start = (page - 1) * MESSAGES_PER_PAGE;
  const pageMessages = normalized.slice(start, start + MESSAGES_PER_PAGE);

  let text = `📥 Inbox for ${emailId} (${normalized.length} messages)\n`;
  text += `Page ${page} of ${totalPages}\n\n`;

  for (const msg of pageMessages) {
    if (msg.hasCode) text += `🔑 OTP: ${msg.code}\n`;
    if (msg.subject) text += `📝 ${msg.subject}\n`;
    if (msg.senderName) text += `👤 ${msg.senderName}\n`;
    if (msg.time) {
      const timeStr = new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      text += `🕐 ${timeStr}\n`;
    }
    if (msg.body && !msg.hasCode) {
      const bodyPreview = msg.body.length > 150 ? msg.body.substring(0, 150) + '...' : msg.body;
      text += `${bodyPreview}\n`;
    }
    text += '\n———————————\n\n';
  }

  const navButtons = [];
  if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `messages:${emailId}:p${page - 1}` });
  navButtons.push({ text: '🔄 Refresh', callback_data: `messages:${emailId}:p${page}` });
  if (page < totalPages) navButtons.push({ text: 'Next ➡️', callback_data: `messages:${emailId}:p${page + 1}` });

  return safeEdit(ctx, text, {
    reply_markup: {
      inline_keyboard: [navButtons],
    },
  });
}

async function safeEdit(ctx, text, options) {
  try {
    return await ctx.editMessageText(text, options);
  } catch (err) {
    if (err.message?.includes('message is not modified')) {
      return; // Silently ignore — content unchanged
    }
    throw err;
  }
}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

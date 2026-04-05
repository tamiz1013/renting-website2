import mongoose from 'mongoose';
import RealtimeEmail from '../models/RealtimeEmail.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import { matchesPlatform, normalizeMessage } from '../utils/helpers.js';
import { bot } from '../telegram/bot.js';

const POLL_INTERVAL = 10_000; // 10 seconds
let lastSeenId = null;
let timer = null;

// Track already-sent message IDs to avoid duplicates
const sentMessageIds = new Set();
const MAX_SENT_CACHE = 5000;

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripUrls(text) {
  if (!text) return '';
  return text
    .replace(/\[?https?:\/\/[^\s\]]+\]?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatEmailMessage(emailId, platform, msg) {
  let text = `📨 <b>New email for</b> ${escHtml(emailId)}\n`;
  if (platform) text += `🏷 Platform: ${escHtml(platform)}\n`;
  text += '\n';

  if (msg.hasCode) {
    text += `🔑 OTP: <code>${escHtml(msg.code)}</code>\n`;
  }
  if (msg.subject) text += `📝 ${escHtml(msg.subject)}\n`;
  if (msg.senderName) text += `👤 ${escHtml(msg.senderName)}\n`;
  if (msg.time) {
    const timeStr = new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    text += `🕐 ${timeStr}\n`;
  }
  if (msg.body) {
    const cleanBody = stripUrls(msg.body);
    // Telegram limit is 4096; leave room for header
    const maxLen = 4096 - text.length - 50;
    const bodyText = cleanBody.length > maxLen ? cleanBody.substring(0, maxLen) + '...' : cleanBody;
    if (bodyText) text += `\n📄 ${escHtml(bodyText)}\n`;
  }

  return text;
}

async function checkNewEmails() {
  try {
    if (!RealtimeEmail || !bot) return;

    const now = new Date();
    // On first run, create an ObjectId for ~30 seconds ago to only pick up recent emails
    if (!lastSeenId) {
      const thirtySecsAgo = new Date(now.getTime() - 30_000);
      lastSeenId = mongoose.Types.ObjectId.createFromTime(Math.floor(thirtySecsAgo.getTime() / 1000));
    }

    // Find new emails since last seen _id
    const newEmails = await RealtimeEmail.find({
      _id: { $gt: lastSeenId },
    }).sort({ _id: 1 }).limit(50).lean();

    if (newEmails.length === 0) return;

    // Update last seen to the latest email's _id
    lastSeenId = newEmails[newEmails.length - 1]._id;

    // Get all active short-term rentals
    const activeShortTerm = await EmailInventory.find({
      lock_type: 'short_term',
      current_user: { $ne: null },
      short_term_expires_at: { $gt: now },
    }).lean();

    if (activeShortTerm.length === 0) return;

    // Build a lookup: email_id → rental info
    const rentalMap = new Map();
    for (const rental of activeShortTerm) {
      const id = rental.email_id.toLowerCase();
      const localPart = id.split('@')[0];
      rentalMap.set(id, rental);
      rentalMap.set(localPart, rental);
    }

    // Match each new email to active rentals
    for (const rawEmail of newEmails) {
      const emailDocId = rawEmail._id.toString();
      if (sentMessageIds.has(emailDocId)) continue;

      const emailAccount = (rawEmail.emailAccount || '').toLowerCase();
      const forwardedFrom = (rawEmail.forwardedFrom || '').toLowerCase();

      // Find matching rental
      let matchedRental = null;
      for (const [key, rental] of rentalMap) {
        if (emailAccount.includes(key) || forwardedFrom.includes(key)) {
          matchedRental = rental;
          break;
        }
      }

      if (!matchedRental) continue;

      // Verify platform match for short-term
      const platform = matchedRental.current_platform;
      if (platform) {
        const textToCheck = [rawEmail.platform, rawEmail.senderName, rawEmail.subject].filter(Boolean).join(' ');
        if (!matchesPlatform(platform, textToCheck)) continue;
      }

      // Find user and check if they have Telegram linked
      const user = await User.findById(matchedRental.current_user).lean();
      if (!user || !user.telegramChatId) continue;

      // Format and send
      const msg = normalizeMessage(rawEmail, platform);
      const text = formatEmailMessage(matchedRental.email_id, platform, msg);

      try {
        await bot.telegram.sendMessage(user.telegramChatId, text, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📥 Check Full Inbox', callback_data: `poll:${matchedRental.email_id}` }],
            ],
          },
        });
      } catch (sendErr) {
        console.error(`[TelegramNotifier] Failed to send to ${user.telegramChatId}:`, sendErr.message);
      }

      // Mark as sent
      sentMessageIds.add(emailDocId);
      if (sentMessageIds.size > MAX_SENT_CACHE) {
        // Evict oldest entries
        const entries = [...sentMessageIds];
        for (let i = 0; i < entries.length - MAX_SENT_CACHE / 2; i++) {
          sentMessageIds.delete(entries[i]);
        }
      }
    }
  } catch (err) {
    console.error('[TelegramNotifier] Poll error:', err.message);
  }
}

export function startTelegramNotifier() {
  if (!RealtimeEmail) {
    console.warn('[TelegramNotifier] No realtime DB — disabled');
    return;
  }
  console.log('[TelegramNotifier] Started — polling every 10s');
  timer = setInterval(checkNewEmails, POLL_INTERVAL);
}

export function stopTelegramNotifier() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

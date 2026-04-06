import { Router } from 'express';
import RealtimeEmail from '../models/RealtimeEmail.js';
import EmailInventory from '../models/EmailInventory.js';
import Pricing from '../models/Pricing.js';
import { authenticate } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { inboxPollSchema } from '../utils/validation.js';
import { matchesPlatform, normalizeMessage, escapeRegex } from '../utils/helpers.js';

const router = Router();

// GET /api/inbox/poll?email_id=xxx — Poll for new messages during short-term assignment
router.get('/poll', authenticate, validateQuery(inboxPollSchema), async (req, res) => {
  try {
    const { email_id } = req.validatedQuery;
    const userId = req.user._id;

    // Verify the caller owns this assignment
    let email = await EmailInventory.findOne({
      email_id,
      $or: [
        { lock_type: 'short_term', current_user: userId },
        { lock_type: 'long_term', long_term_user: userId },
      ],
    });

    // Fallback: if email was deleted from inventory, check user's active_rentals
    let isFallback = false;
    if (!email) {
      const now = new Date();
      const activeRental = (req.user.active_rentals || []).find(
        (r) => r.email_id === email_id && r.expires_at > now
      );
      if (activeRental) {
        isFallback = true;
        email = {
          email_id,
          lock_type: activeRental.lock_type,
          current_platform: activeRental.lock_type === 'short_term' ? activeRental.platform : null,
          short_term_assigned_at: null,
          long_term_assigned_at: null,
        };
      }
    }

    if (!email) {
      return res.status(403).json({ error: 'You do not have access to this email' });
    }

    if (!RealtimeEmail) {
      return res.status(503).json({ error: 'Realtime inbox not configured' });
    }

    const platform = email.lock_type === 'short_term'
      ? email.current_platform
      : null; // long-term sees all messages

    // Use createdAt (DB insertion time) instead of emailTime (original send time)
    // to avoid clock skew and string-vs-Date mismatches
    const sinceTime = email.lock_type === 'short_term'
      ? email.short_term_assigned_at
      : email.long_term_assigned_at;

    const query = {
      $or: [
        { forwardedFrom: { $regex: escapeRegex(email_id), $options: 'i' } },
        { emailAccount: { $regex: escapeRegex(email_id), $options: 'i' } },
      ],
    };

    if (sinceTime) {
      query.createdAt = { $gte: sinceTime };
    }

    const rawMessages = await RealtimeEmail.find(query)
      .sort({ emailTime: -1 })
      .limit(50)
      .lean();

    // Filter by platform (for short-term) and normalize
    let messages = rawMessages;

    if (platform) {
      messages = rawMessages.filter((msg) => {
        const textToCheck = [msg.platform, msg.senderName, msg.subject].filter(Boolean).join(' ');
        return matchesPlatform(platform, textToCheck);
      });
    }

    const normalized = messages.map((msg) => normalizeMessage(msg, platform));

    // Short-term: if any messages arrived, mark inbox_received on the email
    if (!isFallback && email.lock_type === 'short_term' && normalized.length > 0 && !email.short_term_inbox_received) {
      await EmailInventory.findByIdAndUpdate(email._id, {
        $set: { short_term_inbox_received: true },
      });
    }

    // Long-term: if OTP messages are found, lock the matching platform (skip if fallback)
    if (!isFallback && email.lock_type === 'long_term' && normalized.length > 0) {
      // Get all short-term platforms to match against
      const pricingDocs = await Pricing.find({ platform: { $ne: '_long_term' }, enabled: { $ne: false } }).lean();
      const shortTermPlatforms = pricingDocs.map((p) => p.platform);

      const platformsToLock = new Set();
      for (const msg of rawMessages) {
        const hasOtp = msg.otpList && msg.otpList.length > 0;
        if (!hasOtp) continue;

        const textToCheck = [msg.platform, msg.senderName, msg.subject].filter(Boolean).join(' ');
        for (const plat of shortTermPlatforms) {
          if (matchesPlatform(plat, textToCheck)) {
            // Only lock if currently available
            const platStatus = email.platform_status?.get(plat);
            if (platStatus && platStatus.available && !platStatus.banned) {
              platformsToLock.add(plat);
            }
          }
        }
      }

      if (platformsToLock.size > 0) {
        const lockUpdates = {};
        for (const plat of platformsToLock) {
          lockUpdates[`platform_status.${plat}.available`] = false;
        }
        await EmailInventory.findByIdAndUpdate(email._id, { $set: lockUpdates });
      }
    }

    res.json({ messages: normalized, count: normalized.length });
  } catch (err) {
    console.error('[Inbox] Poll error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inbox/messages?email_id=xxx — Get all messages for a long-term rental
router.get('/messages', authenticate, validateQuery(inboxPollSchema), async (req, res) => {
  try {
    const { email_id } = req.validatedQuery;
    const userId = req.user._id;

    let email = await EmailInventory.findOne({
      email_id,
      lock_type: 'long_term',
      long_term_user: userId,
    });

    // Fallback: if email was deleted from inventory, check user's active_rentals
    let isFallback = false;
    if (!email) {
      const now = new Date();
      const activeRental = (req.user.active_rentals || []).find(
        (r) => r.email_id === email_id && r.lock_type === 'long_term' && r.expires_at > now
      );
      if (activeRental) {
        isFallback = true;
        email = { email_id, lock_type: 'long_term' };
      }
    }

    if (!email) {
      return res.status(403).json({ error: 'You do not have access to this email' });
    }

    if (!RealtimeEmail) {
      return res.status(503).json({ error: 'Realtime inbox not configured' });
    }

    // Build a flexible query that matches the email address in any relevant field.
    // We intentionally skip the time filter for long-term rentals — users should
    // see their full inbox, and emailTime may be stored as a string in the realtime
    // collection which breaks BSON Date comparisons.
    const localPart = email_id.split('@')[0]; // e.g. "child1" from "child1@icloud.com"
    const escapedId = escapeRegex(email_id);
    const escapedLocal = escapeRegex(localPart);
    const query = {
      $or: [
        { forwardedFrom: { $regex: escapedId, $options: 'i' } },
        { emailAccount: { $regex: escapedId, $options: 'i' } },
        { forwardedFrom: { $regex: escapedLocal, $options: 'i' } },
        { emailAccount: { $regex: escapedLocal, $options: 'i' } },
      ],
    };

    const rawMessages = await RealtimeEmail.find(query)
      .sort({ emailTime: -1 })
      .limit(200)
      .lean();

    const normalized = rawMessages.map((msg) => normalizeMessage(msg));

    // Long-term: if any OTP messages found, lock the matching short-term platform (skip if fallback)
    if (!isFallback && rawMessages.length > 0) {
      const pricingDocs = await Pricing.find({ platform: { $ne: '_long_term' }, enabled: { $ne: false } }).lean();
      const shortTermPlatforms = pricingDocs.map((p) => p.platform);

      const platformsToLock = new Set();
      for (const msg of rawMessages) {
        const hasOtp = msg.otpList && msg.otpList.length > 0;
        if (!hasOtp) continue;

        const textToCheck = [msg.platform, msg.senderName, msg.subject].filter(Boolean).join(' ');
        for (const plat of shortTermPlatforms) {
          if (matchesPlatform(plat, textToCheck)) {
            const platStatus = email.platform_status?.get(plat);
            if (platStatus && platStatus.available && !platStatus.banned) {
              platformsToLock.add(plat);
            }
          }
        }
      }

      if (platformsToLock.size > 0) {
        const lockUpdates = {};
        for (const plat of platformsToLock) {
          lockUpdates[`platform_status.${plat}.available`] = false;
        }
        await EmailInventory.findByIdAndUpdate(email._id, { $set: lockUpdates });
      }
    }

    res.json({ messages: normalized, count: normalized.length });
  } catch (err) {
    console.error('[Inbox] Messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inbox/debug?email_id=xxx — Admin: see raw realtime docs for an email
router.get('/debug', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const email_id = req.query.email_id;
  if (!email_id) return res.status(400).json({ error: 'email_id required' });
  if (!RealtimeEmail) return res.status(503).json({ error: 'Realtime DB not configured' });

  const localPart = email_id.split('@')[0];
  const docs = await RealtimeEmail.find({
    $or: [
      { forwardedFrom: { $regex: escapeRegex(email_id), $options: 'i' } },
      { emailAccount: { $regex: escapeRegex(email_id), $options: 'i' } },
      { forwardedFrom: { $regex: escapeRegex(localPart), $options: 'i' } },
      { emailAccount: { $regex: escapeRegex(localPart), $options: 'i' } },
    ],
  }).limit(5).lean();

  res.json({ count: docs.length, sample: docs });
});

export default router;

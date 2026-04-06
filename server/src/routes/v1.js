import { Router } from 'express';
import config from '../config/index.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import Pricing from '../models/Pricing.js';
import RealtimeEmail from '../models/RealtimeEmail.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validate.js';
import {
  shortTermRequestSchema,
  shortTermActionSchema,
  banSchema,
  reportSchema,
  inboxPollSchema,
} from '../utils/validation.js';
import { generateLockToken, buildLockEvent, escapeRegex, matchesPlatform, normalizeMessage } from '../utils/helpers.js';

const router = Router();

// All v1 routes require API key
router.use(authenticateApiKey);

// GET /api/v1/me — Account info + balance
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({
    name: u.name,
    email: u.email,
    balance: u.balance,
    active_rentals: (u.active_rentals || []).filter((r) => r.lock_type === 'short_term'),
  });
});

// GET /api/v1/platforms — List available platforms with pricing
router.get('/platforms', async (req, res) => {
  try {
    const pricing = await Pricing.find({ enabled: true, platform: { $ne: '_long_term' } }).sort({ platform: 1 });
    res.json({
      platforms: pricing.map((p) => ({
        platform: p.platform,
        price: p.short_term_price,
        duration_minutes: config.shortTermDurationMs / 60000,
      })),
    });
  } catch (err) {
    console.error('[API v1] Platforms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/short-term/request — Request a short-term email for a platform
router.post('/short-term/request', validate(shortTermRequestSchema), async (req, res) => {
  try {
    const { platform } = req.validated;
    const userId = req.user._id;

    const activeCount = req.user.active_rentals.filter(
      (r) => r.lock_type === 'short_term' && r.expires_at > new Date()
    ).length;
    if (activeCount >= config.maxActiveShortTerm) {
      return res.status(400).json({ error: `Maximum ${config.maxActiveShortTerm} active short-term rentals allowed` });
    }

    const pricing = await Pricing.findOne({ platform, enabled: true });
    if (!pricing) {
      return res.status(400).json({ error: `Platform "${platform}" is not available` });
    }

    if (req.user.balance < pricing.short_term_price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.shortTermDurationMs);
    const lockToken = generateLockToken();

    const userBannedEmails = req.user.banned_emails || [];

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
      return res.status(404).json({ error: `No available email for platform "${platform}"` });
    }

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
      }
    );

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
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    await UsageLog.create({
      user_id: userId,
      email_id: email.email_id,
      action: 'short_term_assign',
      platform,
      lock_type: 'short_term',
      amount: pricing.short_term_price,
      meta: { via: 'api' },
    });

    res.json({
      email_id: email.email_id,
      platform,
      lock_token: lockToken,
      assigned_at: now,
      expires_at: expiresAt,
      price: pricing.short_term_price,
    });
  } catch (err) {
    console.error('[API v1] Request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/short-term/active — List active assignments
router.get('/short-term/active', async (req, res) => {
  try {
    const emails = await EmailInventory.find({
      lock_type: 'short_term',
      current_user: req.user._id,
    }).select('email_id current_platform lock_token short_term_assigned_at short_term_expires_at short_term_inbox_received');

    res.json({
      assignments: emails.map((e) => ({
        email_id: e.email_id,
        platform: e.current_platform,
        lock_token: e.lock_token,
        assigned_at: e.short_term_assigned_at,
        expires_at: e.short_term_expires_at,
        inbox_received: e.short_term_inbox_received || false,
      })),
    });
  } catch (err) {
    console.error('[API v1] Active error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/short-term/inbox?email_id=xxx — Poll inbox for messages
router.get('/short-term/inbox', validateQuery(inboxPollSchema), async (req, res) => {
  try {
    const { email_id } = req.validatedQuery;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_type: 'short_term',
      current_user: userId,
    });

    if (!email) {
      return res.status(403).json({ error: 'You do not have access to this email' });
    }

    if (!RealtimeEmail) {
      return res.status(503).json({ error: 'Realtime inbox not configured' });
    }

    const platform = email.current_platform;
    const sinceTime = email.short_term_assigned_at;

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

    let messages = rawMessages;
    if (platform) {
      messages = rawMessages.filter((msg) => {
        const textToCheck = [msg.platform, msg.senderName, msg.subject].filter(Boolean).join(' ');
        return matchesPlatform(platform, textToCheck);
      });
    }

    const normalized = messages.map((msg) => normalizeMessage(msg, platform));

    if (email.lock_type === 'short_term' && normalized.length > 0 && !email.short_term_inbox_received) {
      await EmailInventory.findByIdAndUpdate(email._id, {
        $set: { short_term_inbox_received: true },
      });
    }

    res.json({ messages: normalized, count: normalized.length });
  } catch (err) {
    console.error('[API v1] Inbox error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/short-term/complete — Mark OTP received
router.post('/short-term/complete', validate(shortTermActionSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const current = await EmailInventory.findOne({
      email_id,
      lock_token,
      lock_type: 'short_term',
      current_user: userId,
    });
    if (!current) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }
    const platform = current.current_platform;

    await EmailInventory.findOneAndUpdate(
      { email_id, lock_token, lock_type: 'short_term', current_user: userId },
      {
        $set: {
          short_term_otp_received: true,
          lock_type: null, lock_platform: null, lock_acquired_at: null,
          lock_acquired_by: null, lock_token: null, current_user: null,
          current_platform: null, short_term_assigned_at: null,
          short_term_expires_at: null, short_term_inbox_received: false,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('complete', 'short_term', platform, userId, { otp_received: true })],
            $slice: -50,
          },
        },
      }
    );

    await User.findByIdAndUpdate(userId, { $pull: { active_rentals: { email_id } } });

    await UsageLog.create({
      user_id: userId, email_id, action: 'short_term_complete',
      platform, lock_type: 'short_term', meta: { via: 'api' },
    });

    res.json({ message: 'Assignment completed', email_id });
  } catch (err) {
    console.error('[API v1] Complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/short-term/release — Release email (refund if no inbox)
router.post('/short-term/release', validate(shortTermActionSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id, lock_token, lock_type: 'short_term', current_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }

    const platform = email.current_platform;

    let inboxReceived = email.short_term_inbox_received || false;
    if (!inboxReceived && RealtimeEmail) {
      const sinceTime = email.short_term_assigned_at;
      const msgCount = await RealtimeEmail.countDocuments({
        $or: [
          { forwardedFrom: { $regex: escapeRegex(email_id), $options: 'i' } },
          { emailAccount: { $regex: escapeRegex(email_id), $options: 'i' } },
        ],
        ...(sinceTime ? { createdAt: { $gte: sinceTime } } : {}),
      });
      inboxReceived = msgCount > 0;
    }

    const platformAvailUpdate = inboxReceived ? {} : { [`platform_status.${platform}.available`]: true };

    await EmailInventory.findOneAndUpdate(
      { email_id, lock_token },
      {
        $set: {
          lock_type: null, lock_platform: null, lock_acquired_at: null,
          lock_acquired_by: null, lock_token: null, current_user: null,
          current_platform: null, short_term_assigned_at: null,
          short_term_expires_at: null, short_term_otp_received: false,
          short_term_inbox_received: false, ...platformAvailUpdate,
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
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId, email_id, action: 'short_term_release',
      platform, lock_type: 'short_term', amount: refundAmount,
      meta: { refunded: !inboxReceived, inbox_received: inboxReceived, via: 'api' },
    });

    res.json({ message: inboxReceived ? 'Released (no refund — inbox had messages)' : 'Released and refunded', email_id, refunded: refundAmount });
  } catch (err) {
    console.error('[API v1] Release error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/short-term/ban — Ban email for platform
router.post('/short-term/ban', validate(banSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id, lock_token, lock_type: 'short_term',
      current_user: userId, short_term_otp_received: false,
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found, not owned, or OTP already received' });
    }

    const platform = email.current_platform;

    const banUpdate = await EmailInventory.findOneAndUpdate(
      { email_id, lock_token },
      {
        $set: {
          lock_type: null, lock_platform: null, lock_acquired_at: null,
          lock_acquired_by: null, lock_token: null, current_user: null,
          current_platform: null, short_term_assigned_at: null,
          short_term_expires_at: null, short_term_otp_received: false,
          short_term_inbox_received: false,
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

    await User.findByIdAndUpdate(userId, {
      $addToSet: { banned_emails: email_id },
    });

    if (banUpdate) {
      const distinctBanners = new Set(banUpdate.ban_records.map((r) => r.user_id.toString()));
      if (distinctBanners.size >= 3 && !banUpdate.globally_banned) {
        await EmailInventory.findByIdAndUpdate(banUpdate._id, {
          $set: { globally_banned: true },
        });
      }
    }

    const pricing = await Pricing.findOne({ platform });
    const refundAmount = pricing?.short_term_price || 0;

    await User.findByIdAndUpdate(userId, {
      $inc: { balance: refundAmount },
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId, email_id, action: 'short_term_ban',
      platform, lock_type: 'short_term', amount: refundAmount,
      meta: { refunded: true, via: 'api' },
    });

    res.json({ message: 'Platform banned and refunded', email_id, refunded: refundAmount });
  } catch (err) {
    console.error('[API v1] Ban error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/short-term/report — Report an issue
router.post('/short-term/report', validate(reportSchema), async (req, res) => {
  try {
    const { email_id, lock_token, comment } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id, lock_token, lock_type: 'short_term', current_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }

    if (!email.short_term_inbox_received) {
      return res.status(400).json({ error: 'Cannot report before receiving any email' });
    }

    await EmailInventory.findByIdAndUpdate(email._id, {
      $inc: { problem_count: 1 },
      $push: {
        reports: {
          user_id: userId, comment, lock_type: 'short_term',
          platform: email.current_platform, at: new Date(),
        },
      },
    });

    await UsageLog.create({
      user_id: userId, email_id, action: 'report',
      platform: email.current_platform, lock_type: 'short_term',
      meta: { comment, via: 'api' },
    });

    res.json({ message: 'Report submitted' });
  } catch (err) {
    console.error('[API v1] Report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

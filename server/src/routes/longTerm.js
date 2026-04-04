import { Router } from 'express';
import config from '../config/index.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import Pricing from '../models/Pricing.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  longTermRequestSchema,
  longTermActionSchema,
  longTermBanSchema,
  longTermReportSchema,
} from '../utils/validation.js';
import { generateLockToken, buildLockEvent } from '../utils/helpers.js';

const router = Router();

// POST /api/long-term/assign — Request a long-term email rental
router.post('/assign', authenticate, validate(longTermRequestSchema), async (req, res) => {
  try {
    const { duration } = req.validated;
    const userId = req.user._id;

    // Get time-based long-term pricing from the dedicated _long_term document
    const ltPricing = await Pricing.findOne({ platform: '_long_term', enabled: true });
    if (!ltPricing) {
      return res.status(400).json({ error: 'Long-term pricing is not configured. Ask an admin to set it up.' });
    }

    const priceKey = `long_term_${duration}_price`;
    const price = ltPricing[priceKey];
    if (price == null) {
      return res.status(400).json({ error: `No pricing for duration "${duration}"` });
    }

    if (req.user.balance < price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const now = new Date();
    const durationMs = config.longTermDurations[duration];
    const rentalExpiry = new Date(now.getTime() + durationMs);
    const lockToken = generateLockToken();

    // Get list of email_ids this user has previously banned
    const userBannedEmails = req.user.banned_emails || [];

    // Get email_ids this user has previously rented long-term (no re-assignment)
    const previousLongTermLogs = await UsageLog.find(
      { user_id: userId, action: 'long_term_assign' },
      { email_id: 1 }
    ).lean();
    const previousLongTermIds = previousLongTermLogs.map((l) => l.email_id);
    const excludedEmailIds = [...new Set([...userBannedEmails, ...previousLongTermIds])];

    // Get all enabled short-term platforms to check ALL are available
    const pricingDocs = await Pricing.find({ platform: { $ne: '_long_term' }, enabled: { $ne: false } }).lean();
    const platforms = pricingDocs.map((p) => p.platform);

    // Build query: every platform must be available and not banned
    const allPlatformAvailQuery = {};
    for (const plat of platforms) {
      allPlatformAvailQuery[`platform_status.${plat}.available`] = true;
      allPlatformAvailQuery[`platform_status.${plat}.banned`] = { $ne: true };
    }

    // Atomic assignment: find an email with no active lock, not globally banned,
    // not user-banned, and all platforms available
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
          // NOTE: platforms remain available — they only get locked on actual OTP usage
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
      return res.status(404).json({ error: 'No available email for long-term rental' });
    }

    // Deduct balance
    await User.findByIdAndUpdate(userId, {
      $inc: { balance: -price },
      $push: {
        active_rentals: {
          email_id: email.email_id,
          platform: 'long_term',
          expires_at: rentalExpiry,
          lock_type: 'long_term',
        },
      },
    });

    await UsageLog.create({
      user_id: userId,
      email_id: email.email_id,
      action: 'long_term_assign',
      lock_type: 'long_term',
      amount: price,
      meta: { duration },
    });

    res.json({
      email_id: email.email_id,
      lock_token: lockToken,
      assigned_at: now,
      rental_expiry: rentalExpiry,
      duration,
      price,
    });
  } catch (err) {
    console.error('[LongTerm] Assign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/long-term/release — Release a long-term rental
router.post('/release', authenticate, validate(longTermActionSchema), async (req, res) => {
  try {
    const { email_id } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_type: 'long_term',
      long_term_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Long-term rental not found or not owned by you' });
    }

    // Release: clear long-term fields but DO NOT change platform availability
    await EmailInventory.findOneAndUpdate(
      { email_id, lock_type: 'long_term', long_term_user: userId },
      {
        $set: {
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          long_term_user: null,
          long_term_assigned_at: null,
          long_term_released_at: new Date(),
          rental_expiry: null,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('release', 'long_term', 'long_term', userId)],
            $slice: -50,
          },
        },
      }
    );

    await User.findByIdAndUpdate(userId, {
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'long_term_release',
      lock_type: 'long_term',
    });

    res.json({ message: 'Long-term rental released', email_id });
  } catch (err) {
    console.error('[LongTerm] Release error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/long-term/ban — Ban a long-term rental (only if inbox is empty)
router.post('/ban', authenticate, validate(longTermBanSchema), async (req, res) => {
  try {
    const { email_id } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_type: 'long_term',
      long_term_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Long-term rental not found or not owned by you' });
    }

    // Ban: record per-user ban, mark all platforms banned, check for auto-global-ban
    const platformUpdates = {};
    if (email.platform_status) {
      for (const [plat] of email.platform_status) {
        platformUpdates[`platform_status.${plat}.banned`] = true;
        platformUpdates[`platform_status.${plat}.available`] = false;
      }
    }

    const banUpdate = await EmailInventory.findOneAndUpdate(
      { email_id, lock_type: 'long_term', long_term_user: userId },
      {
        $set: {
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          long_term_user: null,
          long_term_assigned_at: null,
          long_term_released_at: new Date(),
          rental_expiry: null,
          ...platformUpdates,
        },
        $push: {
          ban_records: { user_id: userId, platform: null, lock_type: 'long_term', at: new Date() },
          lock_events: {
            $each: [buildLockEvent('ban', 'long_term', 'long_term', userId)],
            $slice: -50,
          },
        },
      },
      { new: true }
    );

    // Record in user's personal banned list
    await User.findByIdAndUpdate(userId, {
      $addToSet: { banned_emails: email_id },
    });

    // Check if 3+ distinct users have banned this email → globally ban it
    if (banUpdate) {
      const distinctBanners = new Set(banUpdate.ban_records.map((r) => r.user_id.toString()));
      if (distinctBanners.size >= 3 && !banUpdate.globally_banned) {
        await EmailInventory.findByIdAndUpdate(banUpdate._id, {
          $set: { globally_banned: true },
        });
      }
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'long_term_ban',
      lock_type: 'long_term',
    });

    res.json({ message: 'Long-term rental banned', email_id });
  } catch (err) {
    console.error('[LongTerm] Ban error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/long-term/report — Report a long-term rental issue
router.post('/report', authenticate, validate(longTermReportSchema), async (req, res) => {
  try {
    const { email_id, comment } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_type: 'long_term',
      long_term_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Long-term rental not found or not owned by you' });
    }

    await EmailInventory.findByIdAndUpdate(email._id, {
      $inc: { problem_count: 1 },
      $push: {
        reports: {
          user_id: userId,
          comment,
          lock_type: 'long_term',
          platform: null,
          at: new Date(),
        },
      },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'report',
      lock_type: 'long_term',
      meta: { comment },
    });

    res.json({ message: 'Report submitted' });
  } catch (err) {
    console.error('[LongTerm] Report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/long-term/active — Get user's active long-term rentals
router.get('/active', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const emails = await EmailInventory.find({
      lock_type: 'long_term',
      long_term_user: userId,
    }).select('-app_password -lock_events');

    res.json({ rentals: emails });
  } catch (err) {
    console.error('[LongTerm] Active list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

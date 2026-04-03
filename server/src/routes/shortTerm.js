import { Router } from 'express';
import config from '../config/index.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import Pricing from '../models/Pricing.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  shortTermRequestSchema,
  shortTermActionSchema,
  banSchema,
  reportSchema,
} from '../utils/validation.js';
import { generateLockToken, buildLockEvent } from '../utils/helpers.js';

const router = Router();

// POST /api/short-term/assign — Request a short-term email for a platform
router.post('/assign', authenticate, validate(shortTermRequestSchema), async (req, res) => {
  try {
    const { platform } = req.validated;
    const userId = req.user._id;

    // Check user's active short-term count
    const activeCount = req.user.active_rentals.filter(
      (r) => r.lock_type === 'short_term' && r.expires_at > new Date()
    ).length;
    if (activeCount >= config.maxActiveShortTerm) {
      return res.status(400).json({ error: `Maximum ${config.maxActiveShortTerm} active short-term rentals allowed` });
    }

    // Get pricing
    const pricing = await Pricing.findOne({ platform, enabled: true });
    if (!pricing) {
      return res.status(400).json({ error: `Platform "${platform}" is not available or has no pricing` });
    }

    // Check balance
    if (req.user.balance < pricing.short_term_price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.shortTermDurationMs);
    const lockToken = generateLockToken();

    // Atomic assignment: find an email that is unlocked and has this platform available + not banned
    const email = await EmailInventory.findOneAndUpdate(
      {
        lock_type: null,
        current_user: null,
        [`platform_status.${platform}.available`]: true,
        [`platform_status.${platform}.banned`]: { $ne: true },
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
          [`platform_status.${platform}.available`]: false,
          [`platform_status.${platform}.otp`]: [], // Clear old OTPs
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

    // Deduct balance
    await User.findByIdAndUpdate(userId, {
      $inc: { balance: -pricing.short_term_price },
      $push: {
        active_rentals: {
          email_id: email.email_id,
          platform,
          expires_at: expiresAt,
          lock_type: 'short_term',
        },
      },
    });

    await UsageLog.create({
      user_id: userId,
      email_id: email.email_id,
      action: 'short_term_assign',
      platform,
      lock_type: 'short_term',
      amount: pricing.short_term_price,
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
    console.error('[ShortTerm] Assign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/short-term/complete — Mark assignment complete (OTP received)
router.post('/complete', authenticate, validate(shortTermActionSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOneAndUpdate(
      {
        email_id,
        lock_token,
        lock_type: 'short_term',
        current_user: userId,
      },
      {
        $set: {
          // OTP was received → platform stays unavailable
          short_term_otp_received: true,
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          current_user: null,
          current_platform: null,
          short_term_assigned_at: null,
          short_term_expires_at: null,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('complete', 'short_term', null, userId, { otp_received: true })],
            $slice: -50,
          },
        },
      },
      { new: true }
    );

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }

    // Remove from user's active rentals
    await User.findByIdAndUpdate(userId, {
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'short_term_complete',
      platform: email.current_platform,
      lock_type: 'short_term',
    });

    res.json({ message: 'Assignment completed', email_id });
  } catch (err) {
    console.error('[ShortTerm] Complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/short-term/release — Release without using (refund)
router.post('/release', authenticate, validate(shortTermActionSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_token,
      lock_type: 'short_term',
      current_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }

    const platform = email.current_platform;

    // Unused → platform returns to available
    await EmailInventory.findOneAndUpdate(
      { email_id, lock_token },
      {
        $set: {
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          current_user: null,
          current_platform: null,
          short_term_assigned_at: null,
          short_term_expires_at: null,
          short_term_otp_received: false,
          [`platform_status.${platform}.available`]: true,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('release', 'short_term', platform, userId, { refunded: true })],
            $slice: -50,
          },
        },
      }
    );

    // Refund balance
    const pricing = await Pricing.findOne({ platform });
    const refundAmount = pricing?.short_term_price || 0;

    await User.findByIdAndUpdate(userId, {
      $inc: { balance: refundAmount },
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'short_term_release',
      platform,
      lock_type: 'short_term',
      amount: refundAmount,
      meta: { refunded: true },
    });

    res.json({ message: 'Released and refunded', email_id, refunded: refundAmount });
  } catch (err) {
    console.error('[ShortTerm] Release error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/short-term/ban — Ban platform (only before OTP received)
router.post('/ban', authenticate, validate(banSchema), async (req, res) => {
  try {
    const { email_id, lock_token } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_token,
      lock_type: 'short_term',
      current_user: userId,
      short_term_otp_received: false, // Only before OTP received
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found, not owned, or OTP already received' });
    }

    const platform = email.current_platform;

    // Ban the platform on this email
    await EmailInventory.findOneAndUpdate(
      { email_id, lock_token },
      {
        $set: {
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          current_user: null,
          current_platform: null,
          short_term_assigned_at: null,
          short_term_expires_at: null,
          short_term_otp_received: false,
          [`platform_status.${platform}.banned`]: true,
          [`platform_status.${platform}.available`]: false,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('ban', 'short_term', platform, userId)],
            $slice: -50,
          },
        },
      }
    );

    // Refund
    const pricing = await Pricing.findOne({ platform });
    const refundAmount = pricing?.short_term_price || 0;

    await User.findByIdAndUpdate(userId, {
      $inc: { balance: refundAmount },
      $pull: { active_rentals: { email_id } },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'short_term_ban',
      platform,
      lock_type: 'short_term',
      amount: refundAmount,
      meta: { refunded: true },
    });

    res.json({ message: 'Platform banned and refunded', email_id, refunded: refundAmount });
  } catch (err) {
    console.error('[ShortTerm] Ban error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/short-term/report — Report an issue
router.post('/report', authenticate, validate(reportSchema), async (req, res) => {
  try {
    const { email_id, lock_token, comment } = req.validated;
    const userId = req.user._id;

    const email = await EmailInventory.findOne({
      email_id,
      lock_type: 'short_term',
      current_user: userId,
    });

    if (!email) {
      return res.status(404).json({ error: 'Assignment not found or not owned by you' });
    }

    await EmailInventory.findByIdAndUpdate(email._id, {
      $inc: { problem_count: 1 },
    });

    await UsageLog.create({
      user_id: userId,
      email_id,
      action: 'report',
      platform: email.current_platform,
      lock_type: 'short_term',
      meta: { comment },
    });

    res.json({ message: 'Report submitted' });
  } catch (err) {
    console.error('[ShortTerm] Report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/short-term/active — Get user's active short-term assignments
router.get('/active', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const emails = await EmailInventory.find({
      lock_type: 'short_term',
      current_user: userId,
    }).select('-app_password -lock_events');

    res.json({ assignments: emails });
  } catch (err) {
    console.error('[ShortTerm] Active list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

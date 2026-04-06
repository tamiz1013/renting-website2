import config from '../config/index.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import Pricing from '../models/Pricing.js';
import { buildLockEvent } from '../utils/helpers.js';

import { primaryConnection } from '../config/db.js';

/**
 * Cleanup expired short-term assignments.
 * If OTP was NOT received → restore platform availability and refund balance.
 * If OTP was received → platform stays unavailable (already handled by complete).
 */
async function cleanupExpiredShortTerm() {
  const now = new Date();

  // Find all expired short-term assignments
  const expired = await EmailInventory.find({
    lock_type: 'short_term',
    short_term_expires_at: { $lte: now },
  });

  for (const email of expired) {
    const platform = email.current_platform;
    const userId = email.current_user;

    // Only refund if OTP was NOT received
    const otpReceived = email.short_term_otp_received;
    const inboxReceived = email.short_term_inbox_received;

    const platformUpdates = {};
    if (!otpReceived && !inboxReceived && platform) {
      // Unused → platform returns to available
      platformUpdates[`platform_status.${platform}.available`] = true;
    }

    await EmailInventory.findOneAndUpdate(
      { _id: email._id, lock_type: 'short_term' },
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
          short_term_inbox_received: false,
          ...platformUpdates,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('expire', 'short_term', platform, userId, { otp_received: otpReceived })],
            $slice: -50,
          },
        },
      }
    );

    // Refund if unused (no OTP received and no inbox messages)
    if (!otpReceived && !inboxReceived && userId && platform) {
      const pricing = await Pricing.findOne({ platform });
      const refundAmount = pricing?.short_term_price || 0;

      if (refundAmount > 0) {
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: refundAmount },
        });
      }

      await UsageLog.create({
        user_id: userId,
        email_id: email.email_id,
        action: 'short_term_expire',
        platform,
        lock_type: 'short_term',
        amount: refundAmount,
        meta: { refunded: !otpReceived, otp_received: otpReceived },
      });
    }

    // Remove from user's active_rentals
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $pull: { active_rentals: { email_id: email.email_id } },
      });
    }
  }

  if (expired.length > 0) {
    console.log(`[Cleanup] Processed ${expired.length} expired short-term assignments`);
  }
}

/**
 * Cleanup expired long-term rentals.
 * When rental_expiry passes, release the email back to the pool.
 * No refund — the user got what they paid for (time expired naturally).
 */
async function cleanupExpiredLongTerm() {
  const now = new Date();

  const expired = await EmailInventory.find({
    lock_type: 'long_term',
    rental_expiry: { $lte: now },
  });

  for (const email of expired) {
    const userId = email.long_term_user;

    await EmailInventory.findOneAndUpdate(
      { _id: email._id, lock_type: 'long_term' },
      {
        $set: {
          lock_type: null,
          lock_platform: null,
          lock_acquired_at: null,
          lock_acquired_by: null,
          lock_token: null,
          long_term_user: null,
          long_term_assigned_at: null,
          long_term_released_at: now,
          rental_expiry: null,
        },
        $push: {
          lock_events: {
            $each: [buildLockEvent('expire', 'long_term', 'long_term', userId)],
            $slice: -50,
          },
        },
      }
    );

    // Remove from user's active_rentals
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $pull: { active_rentals: { email_id: email.email_id } },
      });
    }

    await UsageLog.create({
      user_id: userId,
      email_id: email.email_id,
      action: 'long_term_release',
      lock_type: 'long_term',
      meta: { reason: 'expired' },
    });
  }

  if (expired.length > 0) {
    console.log(`[Cleanup] Processed ${expired.length} expired long-term rentals`);
  }
}

async function runCleanup() {
  await cleanupExpiredShortTerm();
  await cleanupExpiredLongTerm();
}

let cleanupInterval = null;

export function startCleanupWorker() {
  console.log('[Cleanup] Starting cleanup worker');

  const run = () => {
    // Wrap every tick so a DB timeout never produces an unhandled rejection
    cleanupInterval = setInterval(
      () => runCleanup().catch((err) => console.error('[Cleanup] Tick error (non-fatal):', err.message)),
      config.cleanupIntervalMs
    );
    // Run immediately once
    runCleanup().catch((err) => console.error('[Cleanup] Initial run error (non-fatal):', err.message));
  };

  // Wait for DB to be connected before running cleanup
  if (primaryConnection.readyState === 1) {
    run();
  } else {
    primaryConnection.once('connected', run);
  }
}

export function stopCleanupWorker() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Cleanup] Stopped cleanup worker');
  }
}

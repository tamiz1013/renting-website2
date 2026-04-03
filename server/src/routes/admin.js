import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  bulkAddEmailsSchema,
  platformToggleSchema,
  pricingUpdateSchema,
  depositActionSchema,
  userRoleSchema,
} from '../utils/validation.js';
import EmailInventory from '../models/EmailInventory.js';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import DepositRequest from '../models/DepositRequest.js';
import Pricing from '../models/Pricing.js';

const router = Router();
router.use(authenticate, requireAdmin);

// ──── Email Management ────

// POST /api/admin/emails/bulk — Bulk add emails
router.post('/emails/bulk', validate(bulkAddEmailsSchema), async (req, res) => {
  try {
    const { mother_email, app_password, child_emails } = req.validated;

    // Auto-fetch all enabled platforms from Pricing (excluding _long_term)
    const pricingDocs = await Pricing.find({ platform: { $ne: '_long_term' }, enabled: { $ne: false } }).lean();
    const platforms = pricingDocs.map((p) => p.platform);
    if (platforms.length === 0) {
      return res.status(400).json({ error: 'No platforms configured yet. Add pricing first.' });
    }

    const docs = child_emails.map((childEmail) => {
      const platformStatus = {};
      platforms.forEach((p) => {
        platformStatus[p] = { available: true, banned: false, last_used: null, otp: [] };
      });

      return {
        email_id: childEmail,
        mother_email,
        app_password,
        platform_status: platformStatus,
      };
    });

    const result = await EmailInventory.insertMany(docs, { ordered: false }).catch((err) => {
      // Return partial success info on duplicate key errors
      if (err.code === 11000) {
        return { insertedCount: err.result?.insertedCount || 0, duplicates: true };
      }
      throw err;
    });

    const insertedCount = result.insertedCount ?? result.length ?? docs.length;
    res.json({ message: `Added ${insertedCount} emails`, insertedCount });
  } catch (err) {
    console.error('[Admin] Bulk add error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/emails — List all emails (paginated)
router.get('/emails', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      EmailInventory.find()
        .select('-lock_events')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      EmailInventory.countDocuments(),
    ]);

    res.json({ emails, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] Email list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/emails/platform — Toggle platform status on an email
router.put('/emails/platform', validate(platformToggleSchema), async (req, res) => {
  try {
    const { email_id, platform, action } = req.validated;

    const updates = {};
    switch (action) {
      case 'ban':
        updates[`platform_status.${platform}.banned`] = true;
        updates[`platform_status.${platform}.available`] = false;
        break;
      case 'unban':
        updates[`platform_status.${platform}.banned`] = false;
        break;
      case 'make_available':
        updates[`platform_status.${platform}.available`] = true;
        break;
      case 'make_unavailable':
        updates[`platform_status.${platform}.available`] = false;
        break;
    }

    const email = await EmailInventory.findOneAndUpdate(
      { email_id },
      { $set: updates },
      { new: true }
    ).select('-lock_events');

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ message: `Platform ${action} applied`, email });
  } catch (err) {
    console.error('[Admin] Platform toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin force-release a locked email (for stuck long-term rentals)
router.post('/emails/force-release', async (req, res) => {
  try {
    const { email_id } = req.body;
    if (!email_id) return res.status(400).json({ error: 'email_id required' });

    const email = await EmailInventory.findOne({ email_id });
    if (!email) return res.status(404).json({ error: 'Email not found' });

    // Restore platforms to available (unless banned)
    const platformUpdates = {};
    if (email.platform_status) {
      for (const [plat, status] of email.platform_status) {
        if (!status.banned) {
          platformUpdates[`platform_status.${plat}.available`] = true;
        }
      }
    }

    await EmailInventory.findOneAndUpdate(
      { email_id },
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
          long_term_user: null,
          long_term_assigned_at: null,
          long_term_released_at: new Date(),
          rental_expiry: null,
          ...platformUpdates,
        },
      }
    );

    // Remove from any user's active_rentals
    if (email.current_user) {
      await User.findByIdAndUpdate(email.current_user, {
        $pull: { active_rentals: { email_id } },
      });
    }
    if (email.long_term_user) {
      await User.findByIdAndUpdate(email.long_term_user, {
        $pull: { active_rentals: { email_id } },
      });
    }

    res.json({ message: 'Email force-released', email_id });
  } catch (err) {
    console.error('[Admin] Force release error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──── Pricing ────

// GET /api/admin/pricing — Get short-term platform pricing (excludes _long_term)
router.get('/pricing', async (req, res) => {
  try {
    const pricing = await Pricing.find({ platform: { $ne: '_long_term' } }).sort({ platform: 1 });
    res.json({ pricing });
  } catch (err) {
    console.error('[Admin] Pricing list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/pricing — Upsert short-term price for a platform
router.put('/pricing', validate(pricingUpdateSchema), async (req, res) => {
  try {
    const data = req.validated;
    if (data.platform === '_long_term') {
      return res.status(400).json({ error: 'Use /admin/pricing/long-term for long-term pricing' });
    }
    const existing = await Pricing.findOne({ platform: data.platform });
    const isNew = !existing;

    const pricing = await Pricing.findOneAndUpdate(
      { platform: data.platform },
      { $set: data },
      { new: true, upsert: true }
    );

    // If this is a brand-new platform, add it to every existing email
    if (isNew) {
      await EmailInventory.updateMany(
        { [`platform_status.${data.platform}`]: { $exists: false } },
        { $set: { [`platform_status.${data.platform}`]: { available: true, banned: false, last_used: null, otp: [] } } }
      );
    }

    res.json({ pricing });
  } catch (err) {
    console.error('[Admin] Pricing update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/pricing/long-term — Get the global time-based long-term pricing
router.get('/pricing/long-term', async (req, res) => {
  try {
    const lt = await Pricing.findOne({ platform: '_long_term' });
    res.json({ pricing: lt || null });
  } catch (err) {
    console.error('[Admin] LT pricing fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/pricing/long-term — Set the global time-based long-term pricing
router.put('/pricing/long-term', async (req, res) => {
  try {
    const { long_term_7d_price, long_term_1m_price, long_term_3m_price } = req.body;
    if (
      long_term_7d_price == null ||
      long_term_1m_price == null ||
      long_term_3m_price == null
    ) {
      return res.status(400).json({ error: 'All three duration prices are required' });
    }
    const pricing = await Pricing.findOneAndUpdate(
      { platform: '_long_term' },
      {
        $set: {
          platform: '_long_term',
          short_term_price: 0,
          long_term_7d_price: parseFloat(long_term_7d_price),
          long_term_1m_price: parseFloat(long_term_1m_price),
          long_term_3m_price: parseFloat(long_term_3m_price),
          enabled: true,
        },
      },
      { new: true, upsert: true }
    );
    res.json({ pricing });
  } catch (err) {
    console.error('[Admin] LT pricing update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──── Deposits ────

// GET /api/admin/deposits — List all deposit requests
router.get('/deposits', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const deposits = await DepositRequest.find({ status })
      .populate('user_id', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ deposits });
  } catch (err) {
    console.error('[Admin] Deposit list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/deposits/approve
router.post('/deposits/approve', validate(depositActionSchema), async (req, res) => {
  try {
    const { deposit_id, admin_note } = req.validated;

    const deposit = await DepositRequest.findOneAndUpdate(
      { _id: deposit_id, status: 'pending' },
      {
        $set: {
          status: 'approved',
          processed_by: req.user._id,
          processed_at: new Date(),
          admin_note: admin_note || null,
        },
      },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found or already processed' });
    }

    // Credit user balance
    await User.findByIdAndUpdate(deposit.user_id, {
      $inc: { balance: deposit.amount },
    });

    await UsageLog.create({
      user_id: deposit.user_id,
      action: 'deposit_approved',
      amount: deposit.amount,
      meta: { deposit_id, admin: req.user._id },
    });

    res.json({ message: 'Deposit approved', deposit });
  } catch (err) {
    console.error('[Admin] Deposit approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/deposits/reject
router.post('/deposits/reject', validate(depositActionSchema), async (req, res) => {
  try {
    const { deposit_id, admin_note } = req.validated;

    const deposit = await DepositRequest.findOneAndUpdate(
      { _id: deposit_id, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          processed_by: req.user._id,
          processed_at: new Date(),
          admin_note: admin_note || null,
        },
      },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found or already processed' });
    }

    await UsageLog.create({
      user_id: deposit.user_id,
      action: 'deposit_rejected',
      amount: deposit.amount,
      meta: { deposit_id, admin: req.user._id },
    });

    res.json({ message: 'Deposit rejected', deposit });
  } catch (err) {
    console.error('[Admin] Deposit reject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──── Logs ────

// GET /api/admin/logs
router.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.user_id) filter.user_id = req.query.user_id;
    if (req.query.email_id) filter.email_id = req.query.email_id;

    const [logs, total] = await Promise.all([
      UsageLog.find(filter)
        .populate('user_id', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      UsageLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] Logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──── Users ────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] Users list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/role — Change user role
router.put('/users/role', validate(userRoleSchema), async (req, res) => {
  try {
    const { user_id, role } = req.validated;

    // Prevent admin from demoting themselves
    if (user_id === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(
      user_id,
      { $set: { role } },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: `Role updated to ${role}`, user });
  } catch (err) {
    console.error('[Admin] Role change error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

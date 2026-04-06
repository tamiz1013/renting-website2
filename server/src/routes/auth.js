import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import User from '../models/User.js';
import EmailInventory from '../models/EmailInventory.js';
import UsageLog from '../models/UsageLog.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { signupSchema, loginSchema, changePasswordSchema } from '../utils/validation.js';

const router = Router();

// Stricter rate limit for auth endpoints — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
});

// POST /api/auth/signup
router.post('/signup', authLimiter, validate(signupSchema), async (req, res) => {
  try {
    const { name, email, password } = req.validated;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hashed,
    });

    const token = jwt.sign({ userId: user._id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        telegram_username: user.telegram_username,
        telegramLinked: !!user.telegramChatId,
      },
    });
  } catch (err) {
    console.error('[Auth] Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validated;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        telegram_username: user.telegram_username,
        telegramLinked: !!user.telegramChatId,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const userObj = req.user.toObject ? req.user.toObject() : { ...req.user };
  userObj.telegramLinked = !!userObj.telegramChatId;
  delete userObj.telegramChatId;
  delete userObj.telegramLinkCode;
  delete userObj.telegramLinkCodeExpiry;
  res.json({ user: userObj });
});

// PUT /api/auth/password
router.put('/password', authenticate, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.validated;
    const user = await User.findById(req.user._id);

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('[Auth] Password change error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/telegram-link — Generate a one-time link code for Telegram
router.post('/telegram-link', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.telegramChatId) {
      return res.status(400).json({ error: 'Telegram is already linked to this account' });
    }

    // Generate a 6-char alphanumeric code
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.telegramLinkCode = code;
    user.telegramLinkCodeExpiry = expiry;
    await user.save();

    res.json({ code, expires_at: expiry });
  } catch (err) {
    console.error('[Auth] Telegram link code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/telegram-link — Unlink Telegram from account
router.delete('/telegram-link', authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: { telegramChatId: null, telegramLinkCode: null, telegramLinkCodeExpiry: null, telegramLoginCode: null, telegramLoginCodeExpiry: null },
    });

    res.json({ message: 'Telegram unlinked' });
  } catch (err) {
    console.error('[Auth] Telegram unlink error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/telegram-login — Validate one-time Telegram login code and return JWT
router.post('/telegram-login', authLimiter, async (req, res) => {
  try {
    const { user_id, code } = req.body;
    if (!user_id || !code) {
      return res.status(400).json({ error: 'Missing user_id or code' });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(401).json({ error: 'Invalid login link' });
    }

    if (
      !user.telegramLoginCode ||
      user.telegramLoginCode !== code ||
      !user.telegramLoginCodeExpiry ||
      user.telegramLoginCodeExpiry < new Date()
    ) {
      return res.status(401).json({ error: 'Login link expired or invalid' });
    }

    // Clear the one-time code
    user.telegramLoginCode = null;
    user.telegramLoginCodeExpiry = null;
    await user.save();

    const token = jwt.sign({ userId: user._id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        telegram_username: user.telegram_username,
        telegramLinked: !!user.telegramChatId,
      },
    });
  } catch (err) {
    console.error('[Auth] Telegram login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/my-reports — Get current user's report statuses
router.get('/my-reports', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all emails where this user has a report
    const emails = await EmailInventory.find(
      { 'reports.user_id': userId },
      { email_id: 1, reports: 1, globally_banned: 1 }
    ).lean();

    // Collect email_ids to batch-query usage logs
    const emailIds = emails.map((e) => e.email_id);

    const [refundLogs, resolveLogs, deleteLogs] = await Promise.all([
      UsageLog.find({ email_id: { $in: emailIds }, action: 'admin_refund' }).lean(),
      UsageLog.find({ email_id: { $in: emailIds }, action: 'admin_resolve' }).lean(),
      UsageLog.find({ email_id: { $in: emailIds }, action: 'admin_delete' }).lean(),
    ]);

    const refundMap = {};
    for (const log of refundLogs) {
      if (String(log.meta?.refunded_user) === String(userId)) {
        refundMap[log.email_id] = { refunded: true, amount: log.meta?.refund_amount || log.amount || 0, at: log.createdAt };
      }
    }
    const resolveSet = new Set(resolveLogs.map((l) => l.email_id));
    const deleteSet = new Set(deleteLogs.map((l) => l.email_id));

    const results = [];
    for (const email of emails) {
      const myReports = email.reports.filter((r) => String(r.user_id) === String(userId));
      for (const report of myReports) {
        results.push({
          email_id: email.email_id,
          comment: report.comment,
          lock_type: report.lock_type,
          platform: report.platform,
          reported_at: report.at,
          refunded: !!refundMap[email.email_id],
          refund_amount: refundMap[email.email_id]?.amount || 0,
          resolved: resolveSet.has(email.email_id),
          deleted: deleteSet.has(email.email_id),
        });
      }
    }

    results.sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at));

    res.json({ reports: results });
  } catch (err) {
    console.error('[Auth] My reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import config from '../config/index.js';
import User from '../models/User.js';
import EmailInventory from '../models/EmailInventory.js';
import UsageLog from '../models/UsageLog.js';
import { authenticate } from '../middleware/auth.js';

const googleClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleCallbackUrl
);

const router = Router();

// Stricter rate limit for auth endpoints — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
});

// GET /api/auth/google — redirect user to Google consent screen
router.get('/google', (req, res) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account',
  });
  res.redirect(authUrl);
});

// GET /api/auth/google/callback — Google redirects here after user consents
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error || !code) {
      return res.redirect(`${config.frontendUrl}/login?error=google_denied`);
    }

    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    if (!email) {
      return res.redirect(`${config.frontendUrl}/login?error=no_email`);
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    if (user) {
      if (!user.googleId) { user.googleId = googleId; await user.save(); }
    } else {
      user = await User.create({ name: name || 'Google User', email, googleId });
    }

    const token = jwt.sign({ userId: user._id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.redirect(`${config.frontendUrl}/google-callback?token=${token}`);
  } catch (err) {
    console.error('[Auth] Google callback error:', err);
    res.redirect(`${config.frontendUrl}/login?error=google_failed`);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const userObj = req.user.toObject ? req.user.toObject() : { ...req.user };
  userObj.telegramLinked = !!userObj.telegramChatId;
  delete userObj.telegramChatId;
  delete userObj.telegramLinkCode;
  delete userObj.telegramLinkCodeExpiry;
  delete userObj.apiKeyHash;
  res.json({ user: userObj });
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

// POST /api/auth/api-key — Generate or regenerate API key
router.post('/api-key', authenticate, async (req, res) => {
  try {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const prefix = rawKey.slice(0, 8);
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await User.findByIdAndUpdate(req.user._id, {
      $set: { apiKeyHash: hash, apiKeyPrefix: prefix },
    });

    res.json({ api_key: rawKey, prefix });
  } catch (err) {
    console.error('[Auth] API key generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/api-key — Revoke API key
router.delete('/api-key', authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: { apiKeyHash: null, apiKeyPrefix: null },
    });

    res.json({ message: 'API key revoked' });
  } catch (err) {
    console.error('[Auth] API key revoke error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

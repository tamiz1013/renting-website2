import { Router } from 'express';
import User from '../models/User.js';
import UsageLog from '../models/UsageLog.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { transferSchema } from '../utils/validation.js';

const router = Router();

// POST /api/transfer — Transfer balance to another user
router.post('/', authenticate, validate(transferSchema), async (req, res) => {
  try {
    const { recipient_email, amount } = req.validated;
    const senderId = req.user._id;

    // Prevent self-transfer
    if (recipient_email.toLowerCase() === req.user.email) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // Check recipient exists
    const recipient = await User.findOne({ email: recipient_email.toLowerCase() });
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Atomically debit sender (only if balance is sufficient)
    const sender = await User.findOneAndUpdate(
      { _id: senderId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
    if (!sender) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Credit recipient
    await User.updateOne({ _id: recipient._id }, { $inc: { balance: amount } });

    // Log both sides
    await UsageLog.create([
      {
        user_id: senderId,
        action: 'balance_transfer',
        amount: -amount,
        meta: { to: recipient._id, to_email: recipient.email },
      },
      {
        user_id: recipient._id,
        action: 'balance_transfer',
        amount,
        meta: { from: senderId, from_email: sender.email },
      },
    ]);

    res.json({ balance: sender.balance });
  } catch (err) {
    console.error('[Transfer] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transfer/history — Get user's transfer history
router.get('/history', authenticate, async (req, res) => {
  try {
    const logs = await UsageLog.find({
      user_id: req.user._id,
      action: 'balance_transfer',
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ transfers: logs });
  } catch (err) {
    console.error('[Transfer] History error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

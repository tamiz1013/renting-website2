import { Router } from 'express';
import DepositRequest from '../models/DepositRequest.js';
import UsageLog from '../models/UsageLog.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { depositRequestSchema } from '../utils/validation.js';

const router = Router();

// POST /api/deposits — Create a deposit request
router.post('/', authenticate, validate(depositRequestSchema), async (req, res) => {
  try {
    const { amount, transaction_id } = req.validated;
    const userId = req.user._id;

    const deposit = await DepositRequest.create({
      user_id: userId,
      amount,
      transaction_id,
    });

    await UsageLog.create({
      user_id: userId,
      action: 'deposit_request',
      amount,
      meta: { deposit_id: deposit._id },
    });

    res.status(201).json({ deposit });
  } catch (err) {
    console.error('[Deposits] Create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/deposits — Get user's deposit requests
router.get('/', authenticate, async (req, res) => {
  try {
    const deposits = await DepositRequest.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ deposits });
  } catch (err) {
    console.error('[Deposits] List error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

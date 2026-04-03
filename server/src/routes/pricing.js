import { Router } from 'express';
import Pricing from '../models/Pricing.js';

const router = Router();

// GET /api/pricing — Get all platform pricing (public)
router.get('/', async (req, res) => {
  try {
    const pricing = await Pricing.find({ enabled: true }).sort({ platform: 1 });
    res.json({ pricing });
  } catch (err) {
    console.error('[Pricing] List error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

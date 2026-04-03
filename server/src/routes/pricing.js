import { Router } from 'express';
import Pricing from '../models/Pricing.js';

const router = Router();

// GET /api/pricing — Get all short-term platform pricing (public)
router.get('/', async (req, res) => {
  try {
    // Exclude the _long_term sentinel document from the platform list
    const pricing = await Pricing.find({ enabled: true, platform: { $ne: '_long_term' } }).sort({ platform: 1 });
    res.json({ pricing });
  } catch (err) {
    console.error('[Pricing] List error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/pricing/long-term — Get time-based long-term pricing (public)
router.get('/long-term', async (req, res) => {
  try {
    const lt = await Pricing.findOne({ platform: '_long_term' });
    res.json({ pricing: lt || null });
  } catch (err) {
    console.error('[Pricing] Long-term fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

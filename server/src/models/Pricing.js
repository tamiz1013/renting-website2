import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const pricingSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, unique: true, lowercase: true },
    short_term_price: { type: Number, required: true, min: 0 },
    long_term_7d_price: { type: Number, required: true, min: 0 },
    long_term_1m_price: { type: Number, required: true, min: 0 },
    long_term_3m_price: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Pricing = primaryConnection.model('Pricing', pricingSchema);
export default Pricing;

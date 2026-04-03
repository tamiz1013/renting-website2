import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const depositRequestSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    transaction_id: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_note: { type: String, default: null },
    processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

depositRequestSchema.index({ user_id: 1, createdAt: -1 });
depositRequestSchema.index({ status: 1 });

const DepositRequest = primaryConnection.model('DepositRequest', depositRequestSchema);
export default DepositRequest;

import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const usageLogSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email_id: { type: String },
    action: {
      type: String,
      enum: [
        'short_term_assign', 'short_term_complete', 'short_term_release',
        'short_term_ban', 'short_term_expire',
        'long_term_assign', 'long_term_release', 'long_term_ban',
        'deposit_request', 'deposit_approved', 'deposit_rejected',
        'balance_deduct', 'balance_refund',
        'report',
        'admin_resolve', 'admin_delete',
      ],
      required: true,
    },
    platform: String,
    lock_type: String,
    amount: Number,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

usageLogSchema.index({ user_id: 1, createdAt: -1 });

const UsageLog = primaryConnection.model('UsageLog', usageLogSchema);
export default UsageLog;

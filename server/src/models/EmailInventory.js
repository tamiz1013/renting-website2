import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const platformStatusSchema = new mongoose.Schema(
  {
    available: { type: Boolean, default: true },
    banned: { type: Boolean, default: false },
    last_used: { type: Date, default: null },
    otp: { type: [String], default: [] },
  },
  { _id: false }
);

const lockEventSchema = new mongoose.Schema(
  {
    action: String, // assign, release, complete, ban, expire
    type: String,   // short_term, long_term
    platform: String,
    by: mongoose.Schema.Types.ObjectId,
    at: { type: Date, default: Date.now },
    meta: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const emailInventorySchema = new mongoose.Schema(
  {
    email_id: { type: String, required: true, unique: true },
    mother_email: { type: String, required: true },
    app_password: { type: String, required: true },
    problem_count: { type: Number, default: 0 },

    platform_status: {
      type: Map,
      of: platformStatusSchema,
      default: {},
    },

    // Short-term state
    current_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    current_platform: { type: String, default: null },
    short_term_assigned_at: { type: Date, default: null },
    short_term_expires_at: { type: Date, default: null },
    short_term_otp_received: { type: Boolean, default: false },

    // Long-term state
    long_term_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    long_term_assigned_at: { type: Date, default: null },
    long_term_released_at: { type: Date, default: null },
    rental_expiry: { type: Date, default: null },

    // Unified lock
    lock_type: { type: String, enum: ['short_term', 'long_term', null], default: null },
    lock_platform: { type: String, default: null },
    lock_acquired_at: { type: Date, default: null },
    lock_acquired_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lock_token: { type: String, default: null },

    lock_events: { type: [lockEventSchema], default: [] },
  },
  { timestamps: true }
);

// Required indexes
emailInventorySchema.index({ short_term_expires_at: 1 });
emailInventorySchema.index({ rental_expiry: 1 });
emailInventorySchema.index({ long_term_user: 1, rental_expiry: 1 });
emailInventorySchema.index({ lock_type: 1, lock_acquired_at: 1 });

const EmailInventory = primaryConnection.model('EmailInventory', emailInventorySchema);
export default EmailInventory;

import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    balance: { type: Number, default: 0 },
    active_rentals: [
      {
        email_id: String,
        platform: String,
        expires_at: Date,
        lock_type: { type: String, enum: ['short_term', 'long_term'] },
      },
    ],
    banned_emails: { type: [String], default: [] }, // email_ids this user has banned — never re-assign
    telegram_username: { type: String, trim: true },
    telegramUserId: { type: String, sparse: true }, // permanent — never cleared on unlink
    telegramChatId: { type: String, unique: true, sparse: true },
    telegramLinkCode: { type: String },
    telegramLinkCodeExpiry: { type: Date },
    telegramLoginCode: { type: String },
    telegramLoginCodeExpiry: { type: Date },
  },
  { timestamps: true }
);

const User = primaryConnection.model('User', userSchema);
export default User;

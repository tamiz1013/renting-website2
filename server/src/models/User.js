import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    balance: { type: Number, default: 0, min: 0 },
    active_rentals: [
      {
        email_id: String,
        platform: String,
        expires_at: Date,
        lock_type: { type: String, enum: ['short_term', 'long_term'] },
      },
    ],
    telegram_username: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

const User = primaryConnection.model('User', userSchema);
export default User;

import mongoose from 'mongoose';
import { primaryConnection } from '../config/db.js';

const motherEmailSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    app_password: { type: String, required: true },
    child_email_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const MotherEmail = primaryConnection.model('MotherEmail', motherEmailSchema);
export default MotherEmail;

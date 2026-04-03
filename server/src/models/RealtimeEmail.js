import mongoose from 'mongoose';
import { realtimeConnection } from '../config/db.js';

// Schema mirrors the realtime inbox feed in the external MongoDB
const realtimeEmailSchema = new mongoose.Schema(
  {
    emailAccount: String,
    forwardedFrom: String,
    platform: String,
    senderName: String,
    subject: String,
    body: String,
    emailTime: Date,
    otpList: [
      {
        otp: String,
        code: String,
        time: Date,
        body: String,
        text: String,
      },
    ],
  },
  {
    timestamps: false,
    strict: false, // flexible schema to accommodate varying feed fields
    collection: 'emails', // collection name in sahin DB
  }
);

// Only register the model if realtime connection exists
let RealtimeEmail = null;
if (realtimeConnection) {
  RealtimeEmail = realtimeConnection.model('RealtimeEmail', realtimeEmailSchema);
}

export default RealtimeEmail;

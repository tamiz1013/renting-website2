import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/email-rental',
  realtimeMongodbUri: process.env.REALTIME_MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  shortTermDurationMs: 30 * 60 * 1000, // 30 minutes
  maxActiveShortTerm: 3,
  cleanupIntervalMs: 30 * 1000, // check every 30s
  longTermDurations: {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    '3m': 90 * 24 * 60 * 60 * 1000,
  },
};

export default config;

import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast if critical secrets are missing in production
if (isProduction && !process.env.JWT_SECRET) {
  console.error('[Config] FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

const config = {
  isProduction,
  port: parseInt(process.env.PORT || '3001', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/email-rental',
  realtimeMongodbUri: process.env.REALTIME_MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-fallback-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
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

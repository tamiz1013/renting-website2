import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';

// Unhandled rejection — log but keep running (e.g. DB timeouts)
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason?.message || reason);
});
// Uncaught exceptions — log and exit (process state may be corrupt)
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception — shutting down:', err);
  process.exit(1);
});

import './config/db.js'; // Initialize DB connections

import authRoutes from './routes/auth.js';
import shortTermRoutes from './routes/shortTerm.js';
import longTermRoutes from './routes/longTerm.js';
import inboxRoutes from './routes/inbox.js';
import depositRoutes from './routes/deposits.js';
import pricingRoutes from './routes/pricing.js';
import adminRoutes from './routes/admin.js';
import transferRoutes from './routes/transfer.js';
import { startCleanupWorker, stopCleanupWorker } from './services/cleanup.js';
import { startTelegramNotifier, stopTelegramNotifier } from './services/telegramNotifier.js';
import { initBot, bot } from './telegram/bot.js';

const app = express();

// Security headers
app.use(helmet());

// CORS — restrict to frontend origin in production
app.use(cors({
  origin: config.isProduction ? config.frontendUrl : true,
  credentials: true,
}));

// Global rate limiter — 100 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/short-term', shortTermRoutes);
app.use('/api/long-term', longTermRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/transfer', transferRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port}`);
  startCleanupWorker();
  initBot();
  startTelegramNotifier();
});

// Graceful shutdown for --watch restarts
function shutdown() {
  if (bot) bot.stop();
  stopCleanupWorker();
  stopTelegramNotifier();
  server.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export default app;

import express from 'express';
import cors from 'cors';
import config from './config/index.js';

// Prevent the process from crashing on unhandled promise rejections or
// uncaught exceptions (e.g. DB timeouts during internet outages)
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (non-fatal):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (non-fatal):', err.message);
});
import './config/db.js'; // Initialize DB connections

import authRoutes from './routes/auth.js';
import shortTermRoutes from './routes/shortTerm.js';
import longTermRoutes from './routes/longTerm.js';
import inboxRoutes from './routes/inbox.js';
import depositRoutes from './routes/deposits.js';
import pricingRoutes from './routes/pricing.js';
import adminRoutes from './routes/admin.js';
import { startCleanupWorker } from './services/cleanup.js';

const app = express();

app.use(cors());
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

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port}`);
  startCleanupWorker();
});

export default app;

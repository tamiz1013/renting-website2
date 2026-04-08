import mongoose from 'mongoose';
import config from './index.js';

// Shared connection options — generous timeout so intermittent network
// hiccups (especially on slower connections to Atlas) don't cascade errors
const CONN_OPTS = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 20000,
  socketTimeoutMS: 45000,
};


// Primary DB connection (users, inventory, locks, pricing, deposits, logs)
const primaryConnection = mongoose.createConnection(config.mongodbUri, CONN_OPTS);

primaryConnection.on('connected', () => console.log('[DB] Primary MongoDB connected'));
primaryConnection.on('error', (err) => console.error('[DB] Primary MongoDB error (non-fatal):', err.message));
primaryConnection.on('disconnected', () => console.warn('[DB] Primary MongoDB disconnected — will auto-reconnect'));

// Realtime DB connection (inbound email feed)
let realtimeConnection = null;
if (config.realtimeMongodbUri) {
  realtimeConnection = mongoose.createConnection(config.realtimeMongodbUri, CONN_OPTS);
  realtimeConnection.on('connected', () => console.log('[DB] Realtime MongoDB connected'));
  realtimeConnection.on('error', (err) => console.error('[DB] Realtime MongoDB error (non-fatal):', err.message));
  realtimeConnection.on('disconnected', () => console.warn('[DB] Realtime MongoDB disconnected — will auto-reconnect'));
} else {
  console.warn('[DB] No REALTIME_MONGODB_URI configured — inbox polling will be unavailable');
}

export { primaryConnection, realtimeConnection };

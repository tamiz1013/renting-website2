import crypto from 'crypto';

export function generateLockToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Push a lock event, keeping only the latest 50
export function buildLockEvent(action, type, platform, userId, meta = {}) {
  return {
    action,
    type,
    platform,
    by: userId,
    at: new Date(),
    meta,
  };
}

// Platform regex patterns for matching incoming emails
const PLATFORM_PATTERNS = {
  facebook: /facebook|fb|meta/i,
  craigslist: /craigslist/i,
  x: /twitter|x\.com|\bx\b/i,
  instagram: /instagram|ig/i,
  tiktok: /tiktok/i,
  snapchat: /snapchat/i,
  whatsapp: /whatsapp/i,
  apple: /apple|icloud/i,
  microsoft: /microsoft|outlook|hotmail/i,
  amazon: /amazon/i,
  yahoo: /yahoo/i,
};

export function matchesPlatform(platform, text) {
  const pattern = PLATFORM_PATTERNS[platform.toLowerCase()];
  if (!pattern) {
    // Fallback: direct case-insensitive substring match
    return new RegExp(platform, 'i').test(text);
  }
  return pattern.test(text);
}

// Normalize a realtime email doc into a consistent message shape
export function normalizeMessage(doc, platform) {
  const otpEntry = doc.otpList?.[0];
  const code = typeof otpEntry === 'string' ? otpEntry : (otpEntry?.code || otpEntry?.otp || null);
  const hasCode = !!code;
  const body = doc.body || otpEntry?.body || otpEntry?.text || '';

  // emailTime can be a Date object, an ISO string, or missing — normalise to Date
  let time = doc.emailTime || otpEntry?.time || null;
  if (time && typeof time === 'string') {
    const parsed = new Date(time);
    time = isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    code,
    time,
    body,
    hasCode,
    subject: doc.subject || '',
    senderName: doc.senderName || '',
  };
}

import { z } from 'zod';

// Auth
export const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  telegram_username: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

// Short-term
export const shortTermRequestSchema = z.object({
  platform: z.string().min(1).max(50).toLowerCase(),
});

export const shortTermActionSchema = z.object({
  email_id: z.string().min(1),
  lock_token: z.string().min(1),
});

export const banSchema = z.object({
  email_id: z.string().min(1),
  lock_token: z.string().min(1),
});

export const reportSchema = z.object({
  email_id: z.string().min(1),
  lock_token: z.string().min(1),
  comment: z.string().min(1).max(1000),
});

// Long-term
export const longTermRequestSchema = z.object({
  duration: z.enum(['7d', '1m', '3m']),
});

export const longTermActionSchema = z.object({
  email_id: z.string().min(1),
});

export const longTermBanSchema = z.object({
  email_id: z.string().min(1),
});

export const longTermReportSchema = z.object({
  email_id: z.string().min(1),
  comment: z.string().min(1).max(1000),
});

// Deposits
export const depositRequestSchema = z.object({
  amount: z.number().positive(),
  transaction_id: z.string().min(1).max(200),
});

export const depositActionSchema = z.object({
  deposit_id: z.string().min(1),
  admin_note: z.string().max(500).optional(),
});

// Transfer
export const transferSchema = z.object({
  recipient_email: z.string().email(),
  amount: z.number().positive(),
});

// Admin - pricing
export const pricingUpdateSchema = z.object({
  platform: z.string().min(1).max(50).toLowerCase(),
  short_term_price: z.number().min(0),
  long_term_7d_price: z.number().min(0).optional(),
  long_term_1m_price: z.number().min(0).optional(),
  long_term_3m_price: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
});

// Admin - bulk add emails
export const bulkAddEmailsSchema = z.object({
  mother_email: z.string().email(),
  app_password: z.string().min(1),
  child_emails: z.array(z.string().email()).min(1),
});

// Admin - platform toggle
export const platformToggleSchema = z.object({
  email_id: z.string().min(1),
  platform: z.string().min(1),
  action: z.enum(['ban', 'unban', 'make_available', 'make_unavailable']),
});

// Admin - user role
export const userRoleSchema = z.object({
  user_id: z.string().min(1),
  role: z.enum(['user', 'admin']),
});

// Inbox poll query
export const inboxPollSchema = z.object({
  email_id: z.string().min(1),
});

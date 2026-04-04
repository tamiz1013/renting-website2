import User from '../../models/User.js';

export async function authMiddleware(ctx, next) {
  const chatId = String(ctx.from?.id);
  if (!chatId) return next();

  try {
    const user = await User.findOne({ telegramChatId: chatId }).select('-password');
    ctx.dbUser = user || null;
  } catch (err) {
    console.error('[Telegram] Auth middleware error:', err.message);
    ctx.dbUser = null;
  }

  return next();
}

// Reusable guard — call in handlers that need auth
export function requireAuth(ctx) {
  if (!ctx.dbUser) {
    ctx.reply(
      '🔒 You need an account to use this feature.\n\n'
      + '• /register — Create a new account\n'
      + '• /link <CODE> — Link your existing website account'
    );
    return false;
  }
  return true;
}

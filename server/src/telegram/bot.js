import { Telegraf } from 'telegraf';
import config from '../config/index.js';
import { setupStartCommand } from './commands/start.js';
import { setupAccountCommands } from './commands/account.js';
import { setupShortTermCommands } from './commands/shortTerm.js';
import { setupLongTermCommands } from './commands/longTerm.js';
import { setupInboxCommands } from './commands/inbox.js';
import { setupDepositCommands } from './commands/deposit.js';
import { setupPricingCommands } from './commands/pricing.js';
import { authMiddleware } from './middleware/auth.js';
import { mainKeyboard, guestKeyboard } from './keyboards.js';

let bot = null;

export function initBot() {
  if (!config.telegramBotToken) {
    console.warn('[Telegram] No TELEGRAM_BOT_TOKEN configured — bot disabled');
    return;
  }

  bot = new Telegraf(config.telegramBotToken);

  // Command aliases — map common shortcuts to full command names
  const COMMAND_ALIASES = {
    short: 'shortterm',
    st: 'shortterm',
    long: 'longterm',
    lt: 'longterm',
    me: 'account',
    otp: 'inbox',
    mail: 'inbox',
    price: 'pricing',
    prices: 'pricing',
    bal: 'account',
    balance: 'account',
    rent: 'rentals',
    dep: 'deposit',
    reg: 'register',
  };

  bot.use((ctx, next) => {
    if (ctx.message?.entities?.[0]?.type === 'bot_command' && ctx.message.text) {
      const entity = ctx.message.entities[0];
      const rawCmd = ctx.message.text
        .substring(entity.offset + 1, entity.offset + entity.length)
        .toLowerCase()
        .replace(/@.*$/, '');
      const alias = COMMAND_ALIASES[rawCmd];
      if (alias) {
        const newCmd = '/' + alias;
        const rest = ctx.message.text.substring(entity.offset + entity.length);
        ctx.message.text = newCmd + rest;
        ctx.message.entities[0].length = newCmd.length;
      }
    }
    return next();
  });

  // Attach auth middleware — sets ctx.dbUser if linked
  bot.use(authMiddleware);

  // Register commands
  setupStartCommand(bot);
  setupAccountCommands(bot);
  setupShortTermCommands(bot);
  setupLongTermCommands(bot);
  setupInboxCommands(bot);
  setupDepositCommands(bot);
  setupPricingCommands(bot);

  // Handle text that matches keyboard buttons
  bot.hears('📧 Short-Term Email', requireAuth, (ctx) => ctx.scene?.enter?.('shortTerm') || ctx.reply('Use /shortterm to get a short-term email.'));
  bot.hears('📬 Long-Term Email', requireAuth, (ctx) => ctx.reply('Use /longterm to rent a long-term email.'));
  bot.hears('📥 My Inbox', requireAuth, (ctx) => ctx.reply('Use /inbox to check your active email inbox.'));
  bot.hears('💰 Deposit', requireAuth, (ctx) => ctx.reply('Use /deposit <amount> <transaction_id> to request a deposit.'));
  bot.hears('💵 Pricing', (ctx) => ctx.reply('Use /pricing to see all platform prices.'));
  bot.hears('👤 My Account', requireAuth, (ctx) => ctx.reply('Use /account to see your account details.'));
  bot.hears('📋 My Rentals', requireAuth, (ctx) => ctx.reply('Use /rentals to see active rentals.'));

  // Catch-all for unknown messages
  bot.on('text', (ctx) => {
    if (ctx.dbUser) {
      return ctx.reply(
        '❓ Unknown command. Use the keyboard buttons or type /help to see available commands.',
        { reply_markup: mainKeyboard }
      );
    }
    return ctx.reply(
      '👋 Welcome! Please /register or /link your account first.',
      { reply_markup: guestKeyboard }
    );
  });

  // Error handler
  bot.catch((err, ctx) => {
    console.error('[Telegram] Bot error:', err.message, err.stack);
    ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
  });

  // Log bot info before launching
  bot.telegram.getMe()
    .then((info) => console.log(`[Telegram] Bot @${info.username} starting...`))
    .catch(() => {});

  // Launch with long polling
  bot.launch({ dropPendingUpdates: true })
    .catch((err) => console.error('[Telegram] Bot launch error:', err.message));

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

function requireAuth(ctx, next) {
  if (!ctx.dbUser) {
    return ctx.reply(
      '🔒 You need an account to use this feature.\n\n'
      + '• /register — Create a new account\n'
      + '• /link <CODE> — Link your existing website account',
      { reply_markup: guestKeyboard }
    );
  }
  return next();
}

export { bot };

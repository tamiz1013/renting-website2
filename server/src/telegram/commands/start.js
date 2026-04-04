import { mainKeyboard, guestKeyboard } from '../keyboards.js';

export function setupStartCommand(bot) {
  bot.start((ctx) => {
    if (ctx.dbUser) {
      return ctx.reply(
        `👋 Welcome back, *${escapeMarkdown(ctx.dbUser.name)}*\\!\n\n`
        + `💰 Balance: *$${escapeMarkdown(ctx.dbUser.balance.toFixed(2))}*\n\n`
        + 'Use the keyboard below or type /help to see all commands\\.',
        { parse_mode: 'MarkdownV2', reply_markup: mainKeyboard }
      );
    }

    return ctx.reply(
      '👋 Welcome to the Email Rental Bot\\!\n\n'
      + 'You can rent temporary emails for various platforms right here in Telegram\\.\n\n'
      + '*Already have a website account?*\n'
      + 'Go to your Profile on the website, click "Link Telegram", and use the code here:\n'
      + '`/link YOUR_CODE`\n\n'
      + '*New user?*\n'
      + 'Create an account right here:\n'
      + '`/register`\n\n'
      + 'Type /help for all commands\\.',
      { parse_mode: 'MarkdownV2', reply_markup: guestKeyboard }
    );
  });

  bot.help((ctx) => {
    if (ctx.dbUser) {
      return ctx.reply(
        '📖 *Available Commands*\n\n'
        + '*Email Rentals:*\n'
        + '/shortterm — Get a short\\-term email\n'
        + '/longterm — Rent a long\\-term email\n'
        + '/rentals — View active rentals\n'
        + '/inbox — Check email inbox\n\n'
        + '*Account:*\n'
        + '/account — View account info\n'
        + '/deposit — Request a deposit\n'
        + '/pricing — View platform prices\n'
        + '/unlink — Unlink Telegram from website account\n\n'
        + '*Actions \\(during rental\\):*\n'
        + '/complete — Complete short\\-term \\(OTP received\\)\n'
        + '/release — Release email \\(get refund if unused\\)\n'
        + '/ban — Ban a bad email \\(refund\\)\n'
        + '/report — Report an issue',
        { parse_mode: 'MarkdownV2', reply_markup: mainKeyboard }
      );
    }

    return ctx.reply(
      '📖 *Getting Started*\n\n'
      + '/register — Create a new account\n'
      + '/link CODE — Link existing website account\n'
      + '/pricing — View platform prices\n'
      + '/help — Show this message',
      { parse_mode: 'MarkdownV2', reply_markup: guestKeyboard }
    );
  });
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

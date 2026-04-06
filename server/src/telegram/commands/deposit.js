import DepositRequest from '../../models/DepositRequest.js';
import UsageLog from '../../models/UsageLog.js';
import { requireAuth } from '../middleware/auth.js';

export function setupDepositCommands(bot) {
  // /deposit <amount> <transaction_id> — Create a deposit request
  bot.command('deposit', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const parts = ctx.message.text.split(' ');
    const amount = parseFloat(parts[1]);
    const transactionId = parts.slice(2).join(' ').trim();

    if (!amount || isNaN(amount) || amount <= 0 || !transactionId) {
      return ctx.reply(
        `💰 *To make a deposit, please follow the steps below:*\n\n`
        + '1. Send your payment to the following Binance Pay ID: `115838285`\n\n'
        + '2. After completing the payment, submit your deposit request using this format:\n\n'
        + '`/deposit <amount> <order_id>`\n\n'
        + 'Example:\n'
        + '`/deposit 10 TXN123456789`',
        { parse_mode: 'Markdown' }
      );
    }

    const userId = ctx.dbUser._id;

    const deposit = await DepositRequest.create({
      user_id: userId,
      amount,
      order_id: transactionId,
    });

    await UsageLog.create({
      user_id: userId,
      action: 'deposit_request',
      amount,
      meta: { deposit_id: deposit._id },
    });

    return ctx.reply(
      `✅ Deposit request submitted!\n\n`
      + `💰 Amount: $${amount.toFixed(2)}\n`
      + `🔗 Transaction ID: ${transactionId}\n`
      + `📋 Status: Pending\n\n`
      + 'Admin will review and approve your deposit.\n'
      + 'Use /deposits to check status.'
    );
  });

  // /deposits — List recent deposit requests
  bot.command('deposits', async (ctx) => {
    if (!requireAuth(ctx)) return;

    const deposits = await DepositRequest.find({ user_id: ctx.dbUser._id })
      .sort({ createdAt: -1 })
      .limit(10);

    if (deposits.length === 0) {
      return ctx.reply('💰 No deposit requests yet. Use /deposit to submit one.');
    }

    let text = '💰 *Recent Deposits*\n\n';

    for (const d of deposits) {
      const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌' }[d.status] || '❓';
      const dateStr = d.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      text += `${statusEmoji} $${d.amount.toFixed(2)} — ${d.status.toUpperCase()}\n`;
      text += `   TXN: ${d.transaction_id}\n`;
      text += `   Date: ${dateStr}\n`;
      if (d.admin_note) text += `   Note: ${d.admin_note}\n`;
      text += '\n';
    }

    return ctx.reply(text, { parse_mode: 'Markdown' });
  });
}

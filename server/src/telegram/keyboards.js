// Custom keyboard layouts for the Telegram bot

export const mainKeyboard = {
  keyboard: [
    [{ text: '📧 Short-Term Email' }, { text: '📬 Long-Term Email' }],
    [{ text: '📥 My Inbox' }, { text: '📋 My Rentals' }],
    [{ text: '💰 Deposit' }, { text: '💵 Pricing' }],
    [{ text: '👤 My Account' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

export const guestKeyboard = {
  keyboard: [
    [{ text: '💵 Pricing' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

// Inline keyboard helpers
export function platformInlineKeyboard(platforms, prefix) {
  const rows = [];
  for (let i = 0; i < platforms.length; i += 2) {
    const row = [{ text: platforms[i], callback_data: `${prefix}:${platforms[i]}` }];
    if (platforms[i + 1]) {
      row.push({ text: platforms[i + 1], callback_data: `${prefix}:${platforms[i + 1]}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

export function durationInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '7 Days', callback_data: 'lt_assign:7d' },
        { text: '1 Month', callback_data: 'lt_assign:1m' },
        { text: '3 Months', callback_data: 'lt_assign:3m' },
      ],
    ],
  };
}

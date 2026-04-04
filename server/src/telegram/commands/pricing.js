import Pricing from '../../models/Pricing.js';

export function setupPricingCommands(bot) {
  // /pricing — Show all platform prices (public, no auth required)
  bot.command('pricing', async (ctx) => {
    const [shortTermPricing, ltPricing] = await Promise.all([
      Pricing.find({ enabled: true, platform: { $ne: '_long_term' } }).sort({ platform: 1 }),
      Pricing.findOne({ platform: '_long_term' }),
    ]);

    if (shortTermPricing.length === 0 && !ltPricing) {
      return ctx.reply('❌ No pricing configured yet.');
    }

    let text = '💵 *Platform Pricing*\n\n';

    if (shortTermPricing.length > 0) {
      text += '*Short\\-Term \\(30 min\\):*\n';
      for (const p of shortTermPricing) {
        text += `• ${esc(p.platform)}: $${esc(p.short_term_price.toFixed(2))}\n`;
      }
      text += '\n';
    }

    if (ltPricing) {
      text += '*Long\\-Term:*\n';
      text += `• 7 Days: $${esc(ltPricing.long_term_7d_price.toFixed(2))}\n`;
      text += `• 1 Month: $${esc(ltPricing.long_term_1m_price.toFixed(2))}\n`;
      text += `• 3 Months: $${esc(ltPricing.long_term_3m_price.toFixed(2))}\n`;
    }

    return ctx.reply(text, { parse_mode: 'MarkdownV2' });
  });
}

function esc(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

import { Context } from 'telegraf';
import { addAlert, getUserAlerts } from '../db';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';

export async function alertCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = text.replace('/alert', '').trim().split(/\s+/);
  const telegramId = ctx.from?.id || 0;

  // Show current alerts if no args
  if (args.length < 2 || args[0] === '') {
    const alerts = getUserAlerts(telegramId);
    if (alerts.length === 0) {
      await ctx.reply('🔔 You have no active alerts.\n\nUsage: /alert <ticker> <above|below> <price>\nExample: /alert AAPL above 200');
      return;
    }

    const lines = alerts.map(a => {
      const status = a.is_active ? '⏳' : '✅';
      return `${status} *${a.ticker}* ${a.condition} $${a.target_price}`;
    }).join('\n');

    await ctx.replyWithMarkdown(`🔔 *Your Alerts*\n\n${lines}`);
    return;
  }

  const [ticker, conditionRaw, priceStr] = args;
  const condition = conditionRaw?.toLowerCase() as 'above' | 'below';
  const price = parseFloat(priceStr);

  if (!ticker || !['above', 'below'].includes(condition) || isNaN(price)) {
    await ctx.reply('Usage: /alert <ticker> <above|below> <price>\nExample: /alert AAPL above 200');
    return;
  }

  // Validate ticker exists
  const { data, error } = await stockwise.getStock(ticker);
  if (error || !data) {
    await ctx.reply(`❌ Could not validate ticker ${ticker.toUpperCase()}.`);
    return;
  }

  addAlert(telegramId, ticker, price, condition);
  logEvent({ telegramId, command: '/alert', ticker: ticker.toUpperCase(), success: true });

  await ctx.reply(`🔔 Alert set: *${ticker.toUpperCase()}* ${condition} $${price}. I'll notify you when it hits.`, { parse_mode: 'Markdown' });
}

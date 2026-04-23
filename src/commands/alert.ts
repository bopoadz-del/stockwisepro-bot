import { Context } from 'telegraf';
import { BotContext } from '../types';
import { addAlert, getUserAlerts } from '../db';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';

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

  if (!ticker || !validateTicker(ticker) || !['above', 'below'].includes(condition) || isNaN(price) || price <= 0) {
    await ctx.reply('Usage: /alert <ticker> <above|below> <price>\nExample: /alert AAPL above 200');
    return;
  }

  // Validate ticker exists
  const { data, duration, error } = await stockwise.getStock(ticker, telegramId);
  (ctx as BotContext).state = { ticker: ticker.toUpperCase(), apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error || !data) {
    await ctx.reply(userSafeError());
    return;
  }

  addAlert(telegramId, ticker, price, condition);

  await ctx.reply(`🔔 Alert set: *${ticker.toUpperCase()}* ${condition} $${price}. I'll notify you when it hits.`, { parse_mode: 'Markdown' });
}

import { Context } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';

export async function portfolioCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getPortfolio();
  (ctx as any).state = { apiDuration: duration, success: !error };
  if (error) (ctx as any).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  const portfolio = data;
  if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
    await ctx.reply('💼 Your portfolio is empty.\nUse /mimic to copy an investor strategy.');
    return;
  }

  const holdings = portfolio.holdings.map((h: any) => {
    const t = h.ticker || h.stock?.ticker;
    const shares = h.shares || h.quantity || 0;
    const value = h.currentValue || (h.shares * (h.currentPrice || h.stock?.price));
    return `• *${t}*: ${shares} shares — $${value || '?'}`;
  }).join('\n');

  const totalValue = portfolio.totalValue || portfolio.currentValue || '?';
  const pnl = portfolio.pnl || portfolio.profitLoss;

  let msg = `💼 *Your Portfolio*\n\n${holdings}\n\n*Total Value:* $${totalValue}`;
  if (pnl !== undefined) {
    const sign = pnl >= 0 ? '+' : '';
    msg += `\n*P&L:* ${sign}$${pnl}`;
  }

  await ctx.replyWithMarkdown(msg);
}

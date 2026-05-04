import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { getLocalPortfolio } from '../db';

export async function portfolioCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getPortfolio(telegramId);
  Object.assign(ctx.state, { apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  let portfolio = data;
  let useLocalFallback = false;

  // Fallback to local SQLite if API fails or returns empty
  if (error || !portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
    const localItems = getLocalPortfolio(telegramId);
    if (localItems.length > 0) {
      portfolio = {
        holdings: localItems.map(l => ({
          ticker: l.ticker,
          shares: l.shares,
          currentPrice: l.avg_price,
        })),
        totalValue: localItems.reduce((sum, l) => sum + (l.shares * l.avg_price), 0),
      };
      useLocalFallback = true;
      (ctx as BotContext).state.success = true;
    }
  }

  if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
    await ctx.reply('💼 Your portfolio is empty.\nUse /mimic to copy an investor strategy.');
    return;
  }

  const fmtPrice = (n: unknown) =>
    typeof n === 'number' && isFinite(n)
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '?';

  const holdings = portfolio.holdings.map((h: any) => {
    const t = h.ticker || h.stock?.ticker || '?';
    const shares = h.shares ?? h.quantity ?? 0;
    const rawValue = h.currentValue ?? (shares * (h.currentPrice ?? h.stock?.price ?? h.avg_price));
    return `• *${t}*: ${shares} shares — ${fmtPrice(rawValue)}`;
  }).join('\n');

  const rawTotal = portfolio.totalValue ?? portfolio.currentValue;
  const pnl = portfolio.pnl ?? portfolio.profitLoss;

  let msg = `💼 *Your Portfolio*\n\n${holdings}\n\n*Total Value:* ${fmtPrice(rawTotal)}`;
  if (typeof pnl === 'number' && isFinite(pnl)) {
    const sign = pnl >= 0 ? '+' : '';
    msg += `\n*P&L:* ${sign}${fmtPrice(pnl)}`;
  }
  if (useLocalFallback) {
    msg += '\n\n_(Showing local data — StockWise API is currently unavailable)_';
  }

  await ctx.replyWithMarkdown(msg);
}

import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';

export async function portfolioCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getPortfolio(telegramId);
  Object.assign(ctx.state, { apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  const portfolio = data;
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
    const rawValue = h.currentValue ?? (shares * (h.currentPrice ?? h.stock?.price));
    return `• *${t}*: ${shares} shares — ${fmtPrice(rawValue)}`;
  }).join('\n');

  const rawTotal = portfolio.totalValue ?? portfolio.currentValue;
  const pnl = portfolio.pnl ?? portfolio.profitLoss;

  let msg = `💼 *Your Portfolio*\n\n${holdings}\n\n*Total Value:* ${fmtPrice(rawTotal)}`;
  if (typeof pnl === 'number' && isFinite(pnl)) {
    const sign = pnl >= 0 ? '+' : '';
    msg += `\n*P&L:* ${sign}${fmtPrice(pnl)}`;
  }

  await ctx.replyWithMarkdown(msg);
}

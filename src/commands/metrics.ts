import { Context } from 'telegraf';
import { BotContext } from '../types';
import { getHistoricalPrices } from '../api/yahoo';
import {
  calculateLogReturns,
  calculateAnnualizedVolatility,
  calculateAnnualizedReturn,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateVaR,
  simpleMovingAverage,
} from '../utils/financial';
import { validateTicker } from '../utils/validation';
import { userSafeError } from '../utils/logger';

export async function metricsCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace(/^\/metrics/, '').trim().toUpperCase();

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /metrics <ticker>\nExample: /metrics AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const t0 = Date.now();
  const hist = await getHistoricalPrices(ticker, '2y');
  const apiDuration = Date.now() - t0;

  if (hist.error || !hist.data || hist.data.length < 30) {
    Object.assign(ctx.state, { ticker, apiDuration, success: false });
    await ctx.reply(userSafeError());
    return;
  }

  const prices = hist.data.map(d => d.close);
  const returns = calculateLogReturns(prices);
  const currentPrice = prices[prices.length - 1];
  const startPrice = prices[0];

  const annVol = calculateAnnualizedVolatility(prices);
  const annReturn = calculateAnnualizedReturn(prices);
  const sharpe = calculateSharpeRatio(returns);
  const dd = calculateMaxDrawdown(prices);
  const dailyVaR = calculateVaR(returns, 0.05);
  const annualVaR = dailyVaR * Math.sqrt(252);

  const sma50 = simpleMovingAverage(prices, 50);
  const sma200 = simpleMovingAverage(prices, 200);
  const aboveSma50 = currentPrice > (sma50[sma50.length - 1] || 0);
  const aboveSma200 = currentPrice > (sma200[sma200.length - 1] || 0);

  const totalReturn = (currentPrice - startPrice) / startPrice;

  Object.assign(ctx.state, { ticker, apiDuration, success: true });

  const formatPct = (p: number) => `${(p * 100).toFixed(2)}%`;
  const formatPrice = (p: number) => `$${p.toFixed(2)}`;

  const msg = `
📐 *Risk Metrics: ${ticker}*
_Based on ~2 years of daily prices_

🏷 *Current Price:* ${formatPrice(currentPrice)}
📈 *Total Return:* ${formatPct(totalReturn)}
📊 *Annualized Volatility:* ${formatPct(annVol)}
🎯 *Annualized Return:* ${formatPct(annReturn)}
⭐ *Sharpe Ratio:* ${sharpe.toFixed(2)}

*Drawdown & Risk:*
• Max Drawdown: ${formatPct(dd.maxDrawdown)}
• Peak: ${formatPrice(dd.peak)}
• Trough: ${formatPrice(dd.trough)}
• Daily VaR (5%): ${formatPct(dailyVaR)}
• Annual VaR (5%): ${formatPct(annualVaR)}

*Trend Signals:*
• Above 50-day SMA: ${aboveSma50 ? '✅ Yes' : '❌ No'}
• Above 200-day SMA: ${aboveSma200 ? '✅ Yes' : '❌ No'}

⚠️ _For research purposes only._
  `.trim();

  await ctx.replyWithMarkdown(msg);
}

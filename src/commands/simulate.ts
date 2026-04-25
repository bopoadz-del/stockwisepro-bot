import { Context } from 'telegraf';
import { BotContext } from '../types';
import { getHistoricalPrices } from '../api/yahoo';
import {
  simulateGBM,
  calculateLogReturns,
  calculateAnnualizedVolatility,
  calculateAnnualizedReturn,
  mean,
} from '../utils/financial';
import { validateTicker } from '../utils/validation';
import { userSafeError } from '../utils/logger';

export async function simulateCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = text.replace(/^\/simulate/, '').trim().split(/\s+/);
  const ticker = args[0]?.toUpperCase();
  const days = parseInt(args[1] || '30', 10);
  const simulations = Math.min(parseInt(args[2] || '1000', 10), 5000);

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /simulate <ticker> <days> [simulations]\nExample: /simulate AAPL 30\nMax simulations: 5000');
    return;
  }
  if (isNaN(days) || days < 1 || days > 365) {
    await ctx.reply('Days must be between 1 and 365.');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const hist = await getHistoricalPrices(ticker, '2y');
  if (hist.error || !hist.data || hist.data.length < 30) {
    await ctx.reply(userSafeError());
    return;
  }

  const prices = hist.data.map(d => d.close);
  const currentPrice = prices[prices.length - 1];
  const returns = calculateLogReturns(prices);
  const mu = mean(returns) * 252; // annualized drift
  const sigma = calculateAnnualizedVolatility(prices);

  const result = simulateGBM(currentPrice, mu, sigma, days / 252, days, simulations);

  Object.assign(ctx.state, { ticker, apiDuration: 0, success: true });

  const formatPrice = (p: number) => `$${p.toFixed(2)}`;
  const formatPct = (p: number) => `${(p * 100).toFixed(1)}%`;

  const msg = `
🎲 *Monte Carlo Simulation: ${ticker}*
_${simulations.toLocaleString()} simulations over ${days} days_

🏷 *Current Price:* ${formatPrice(currentPrice)}
📊 *Historical Vol:* ${formatPct(sigma)}
📈 *Historical Drift:* ${formatPct(mu)}

*Price Projections:*
• 10th percentile: ${formatPrice(result.percentile10)}
• 25th percentile: ${formatPrice(result.percentile25)}
• 50th percentile (median): ${formatPrice(result.medianFinal)}
• 75th percentile: ${formatPrice(result.percentile75)}
• 90th percentile: ${formatPrice(result.percentile90)}
• Mean: ${formatPrice(result.meanFinal)}

*Probabilities:*
• 📈 Price goes up: ${formatPct(result.probUp)}
• 📉 Price goes down: ${formatPct(result.probDown)}

⚠️ _This is a statistical model, not financial advice._
  `.trim();

  await ctx.replyWithMarkdown(msg);
}

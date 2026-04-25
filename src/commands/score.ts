import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { getUserWeights } from '../db';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';

const METRIC_KEYS: Record<string, string[]> = {
  valuation: ['valuation', 'value', 'val', 'pe_ratio', 'pb_ratio'],
  profitability: ['profitability', 'profit', 'profi', 'roe', 'roa', 'margin'],
  growth: ['growth', 'grw', 'revenue_growth', 'earnings_growth'],
  financial_health: ['financialHealth', 'financial_health', 'health', 'debt_to_equity', 'current_ratio'],
  momentum: ['momentum', 'mom', 'trend', 'rsi', 'price_change'],
};

function extractMetric(metrics: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (metrics[key] !== undefined) {
      const n = Number(metrics[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function computeWeightedScore(
  metrics: Record<string, unknown>,
  weights: Record<string, number>
): { score: number | null; breakdown: string[] } {
  let totalScore = 0;
  let totalWeight = 0;
  const breakdown: string[] = [];

  for (const [category, weight] of Object.entries(weights)) {
    if (category === 'telegram_id' || category === 'updated_at') continue;
    const keys = METRIC_KEYS[category] || [category];
    const value = extractMetric(metrics, keys);
    if (value !== undefined) {
      totalScore += value * weight;
      totalWeight += weight;
      breakdown.push(`${category.replace(/_/g, ' ')}: ${value} × ${weight}`);
    }
  }

  const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : null;
  return { score, breakdown };
}

export async function scoreCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace('/score', '').trim().toUpperCase();
  const telegramId = ctx.from?.id || 0;

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /score <ticker>\nExample: /score AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.getStockScore(ticker, telegramId);

  Object.assign(ctx.state, { ticker, apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  const eventId = (ctx as BotContext).state.eventId as number;

  if (error || !data) {
    await ctx.reply(userSafeError());
    return;
  }

  // Adapt to your actual API shape. This assumes a flexible display.
  const s = data;
  const rawScore = s.score ?? s.aiScore ?? s.rating ?? 'N/A';
  const price = s.price ?? s.currentPrice ?? 'N/A';
  const metrics = s.metrics || s.fundamentals || {};

  const weights = getUserWeights(telegramId);
  const { score: weightedScore, breakdown } = computeWeightedScore(metrics, weights as any);

  const METRIC_LABELS: Record<string, string> = {
    pe_ratio: 'P/E Ratio',
    pb_ratio: 'P/B Ratio',
    ps_ratio: 'P/S Ratio',
    roe: 'Return on Equity',
    roa: 'Return on Assets',
    margin: 'Profit Margin',
    revenue_growth: 'Revenue Growth',
    earnings_growth: 'Earnings Growth',
    debt_to_equity: 'Debt/Equity',
    current_ratio: 'Current Ratio',
    rsi: 'RSI',
    price_change: 'Price Change',
    valuation: 'Valuation Score',
    profitability: 'Profitability',
    growth: 'Growth Score',
    financial_health: 'Financial Health',
    momentum: 'Momentum',
  };

  let metricsText = '';
  if (Object.keys(metrics).length > 0) {
    metricsText = Object.entries(metrics)
      .slice(0, 6)
      .map(([k, v]) => {
        const label = METRIC_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const val = typeof v === 'number' ? (Number.isInteger(v) ? v : (v as number).toFixed(2)) : v;
        return `  ${label}: ${val}`;
      })
      .join('\n');
  }

  const weightedText = weightedScore !== null
    ? `⚖️ *Weighted Score:* ${weightedScore}\n\n*Breakdown:*\n${breakdown.join('\n')}`
    : '_No matching metrics for weighted scoring. Run /weights to configure._';

  const msg = `
📊 *Score for ${ticker}*

🏷 Price: $${price}
⭐ AI Score: *${rawScore}*

${weightedText}

*Raw Metrics:*
${metricsText || 'N/A'}

_Was this score helpful?_
  `.trim();

  await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
    Markup.button.callback('👍 Accurate', `feedback:${eventId}:1`),
    Markup.button.callback('👎 Off', `feedback:${eventId}:-1`),
  ]));
}

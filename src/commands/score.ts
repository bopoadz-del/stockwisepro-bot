import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { computeLocalScore, ScoreResult } from '../services/scoring';
import { getUserWeights } from '../db';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';

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
  price_change_6m: '6M Price Change',
  valuation: 'Valuation Score',
  profitability: 'Profitability',
  growth: 'Growth Score',
  financial_health: 'Financial Health',
  momentum: 'Momentum',
};

export async function scoreCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace('/score', '').trim().toUpperCase();
  const telegramId = ctx.from?.id || 0;

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /score <ticker>\nExample: /score AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  // 1. Try StockWisePro API first
  const apiStart = Date.now();
  const { data, duration, error } = await stockwise.getStockScore(ticker, telegramId);
  let scoreData: {
    score: number;
    price: number;
    metrics: Record<string, unknown>;
    breakdown?: Record<string, number>;
  } | null = null;

  if (!error && data) {
    const s = data as any;
    scoreData = {
      score: s.score ?? s.aiScore ?? s.rating ?? 'N/A',
      price: s.price ?? s.currentPrice ?? 'N/A',
      metrics: s.metrics || s.fundamentals || {},
    };
  }

  // 2. Fallback to local Yahoo-based scoring if API fails
  let localResult: ScoreResult | null = null;
  if (!scoreData) {
    const localStart = Date.now();
    localResult = await computeLocalScore(ticker);
    if (localResult) {
      scoreData = {
        score: localResult.score,
        price: localResult.price,
        metrics: localResult.metrics as unknown as Record<string, unknown>,
        breakdown: localResult.breakdown,
      };
    }
  }

  const totalDuration = Date.now() - apiStart;
  Object.assign(ctx.state, { ticker, apiDuration: totalDuration, success: !!scoreData });
  if (!scoreData) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  const eventId = (ctx as BotContext).state.eventId as number;

  if (!scoreData) {
    await ctx.reply(userSafeError());
    return;
  }

  const weights = getUserWeights(telegramId);
  const metrics = scoreData.metrics;

  // Compute weighted score
  let weightedSum = 0;
  let weightTotal = 0;
  const breakdownLines: string[] = [];

  // If API provided a pre-computed breakdown, use it; otherwise compute from raw metrics
  const breakdown = scoreData.breakdown || {};
  for (const [category, weight] of Object.entries(weights)) {
    if (category === 'telegram_id' || category === 'updated_at') continue;
    let catScore: number | undefined = breakdown[category];
    if (catScore === undefined) {
      // Try to extract from raw metrics using legacy keys
      const rawVal = metrics[category] ?? metrics[category.replace('_', '')];
      catScore = typeof rawVal === 'number' ? rawVal : undefined;
    }
    if (catScore !== undefined) {
      weightedSum += catScore * weight;
      weightTotal += weight;
      breakdownLines.push(`${METRIC_LABELS[category] || category}: ${Math.round(catScore)} × ${weight}`);
    }
  }

  const weightedScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : (typeof scoreData.score === 'number' ? scoreData.score : 'N/A');

  const metricsText = Object.entries(metrics)
    .filter(([k]) => k !== 'price')
    .slice(0, 6)
    .map(([k, v]) => {
      if (v === undefined || v === null) return null;
      const label = METRIC_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const val = typeof v === 'number' ? (Number.isInteger(v) ? v : (v as number).toFixed(2)) : v;
      return `  ${label}: ${val}`;
    })
    .filter(Boolean)
    .join('\n');

  // Build fundamentals text
  const f = localResult?.fundamentals;
  const fundamentalsText = f
    ? `🧮 *Fundamentals Engine*\n` +
      `  Altman Z: ${f.altman_z.score}/100 (${f.altman_z.zone.toUpperCase()})\n` +
      `  Piotroski F: ${f.piotroski_f.score}/100\n` +
      `  Composite: ${f.composite}/100${f.confidence < 0.7 ? ' ⚠️ low data confidence' : ''}`
    : '';

  const msg = `
📊 *Score for ${ticker}*

🏷 Price: $${scoreData.price}
⭐ AI Score: *${scoreData.score}*

⚖️ *Weighted Score:* ${weightedScore}

*Breakdown:*
${breakdownLines.join('\n') || 'N/A'}

*Raw Metrics:*
${metricsText || 'N/A'}

${fundamentalsText}

_Was this score helpful?_
  `.trim();

  await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
    Markup.button.callback('👍 Accurate', `feedback:${eventId}:1`),
    Markup.button.callback('👎 Off', `feedback:${eventId}:-1`),
  ]));
}

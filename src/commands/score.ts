import { Context, Markup } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { db, getUserWeights } from '../db';
import { userSafeError } from '../utils/logger';

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

  if (!ticker) {
    await ctx.reply('Usage: /score <ticker>\nExample: /score AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.getStockScore(ticker);

  (ctx as any).state = { ticker, apiDuration: duration, success: !error };
  if (error) (ctx as any).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  const eventId = (ctx as any).state.eventId as number;

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

  let metricsText = '';
  if (Object.keys(metrics).length > 0) {
    metricsText = Object.entries(metrics)
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`)
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

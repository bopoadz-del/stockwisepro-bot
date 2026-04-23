import { Context, Markup } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent, db } from '../db';

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

  logEvent({ telegramId, command: '/score', ticker, apiResponseTimeMs: duration, success: !error });

  if (error || !data) {
    await ctx.reply(`❌ Failed to score ${ticker}: ${JSON.stringify(error)}`);
    return;
  }

  // Adapt to your actual API shape. This assumes a flexible display.
  const s = data;
  const score = s.score ?? s.aiScore ?? s.rating ?? 'N/A';
  const price = s.price ?? s.currentPrice ?? 'N/A';
  const metrics = s.metrics || s.fundamentals || {};

  let metricsText = '';
  if (Object.keys(metrics).length > 0) {
    metricsText = Object.entries(metrics)
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  const msg = `
📊 *Score for ${ticker}*

🏷 Price: $${price}
⭐ AI Score: *${score}*

*Key Metrics:*
${metricsText || 'N/A'}

_Was this score helpful?_
  `.trim();

  // Save event ID for feedback callback
  const eventResult = db.prepare('SELECT id FROM analytics_events WHERE telegram_id = ? ORDER BY id DESC LIMIT 1').get(telegramId) as { id: number } | undefined;
  const eventId = eventResult?.id || 0;

  await ctx.replyWithMarkdownV2(msg, Markup.inlineKeyboard([
    Markup.button.callback('👍 Accurate', `feedback:${eventId}:1`),
    Markup.button.callback('👎 Off', `feedback:${eventId}:-1`),
  ]));
}

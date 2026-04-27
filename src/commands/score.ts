import { Context, Markup } from 'telegraf';
import { BotContext, OpenBoxResult } from '../types';
import { stockwise } from '../api/stockwise';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';

export async function scoreCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace('/score', '').trim().toUpperCase();
  const telegramId = ctx.from?.id || 0;

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /score <ticker>\nExample: /score AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const apiStart = Date.now();

  // 1. Try StockWisePro API first
  const { data, error } = await stockwise.getStockScore(ticker, telegramId);
  let openBoxData: OpenBoxResult | null = null;

  if (!error && data) {
    const s = data as any;
    // Detect OpenBox-shaped JSON
    if (
      typeof s.finalScore === 'number' &&
      s.pillars &&
      typeof s.pillars.fundamentals === 'number' &&
      Array.isArray(s.riskFlags) &&
      typeof s.narrative === 'string'
    ) {
      openBoxData = {
        finalScore: s.finalScore,
        pillars: s.pillars,
        riskFlags: s.riskFlags,
        narrative: s.narrative,
        ethicsPass: s.ethicsPass !== false,
        adjustments: s.adjustments || { peerDelta: 0, dominanceBonus: 0 },
      };
    }
  }

  // 2. Fallback to local OpenBox engine
  if (!openBoxData) {
    const localResult = await computeOpenBoxScore(ticker);
    if (localResult) {
      openBoxData = localResult;
    }
  }

  const totalDuration = Date.now() - apiStart;
  Object.assign(ctx.state, { ticker, apiDuration: totalDuration, success: !!openBoxData });
  if (!openBoxData) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  const eventId = (ctx as BotContext).state.eventId as number;

  if (!openBoxData) {
    await ctx.reply(userSafeError());
    return;
  }

  // Ethics hard filter
  if (!openBoxData.ethicsPass) {
    await ctx.reply(`🚫 ETHICS BLOCK: ${openBoxData.riskFlags.join(', ')}. This stock is excluded from scoring.`);
    return;
  }

  const p = openBoxData.pillars;

  // Extract action label from narrative
  let action = 'hold';
  const narrative = openBoxData.narrative;
  if (narrative.includes('aggressive buy')) action = 'aggressive buy';
  else if (narrative.includes('core holding')) action = 'core holding';
  else if (narrative.includes('tactical')) action = 'tactical / watch';
  else if (narrative.includes('avoid') || narrative.includes('exit')) action = 'avoid / exit';

  const riskText = openBoxData.riskFlags.length > 0
    ? openBoxData.riskFlags.map(f => `• ${f}`).join('\n')
    : 'None detected';

  const msg = `
📊 OPENBOX SCORE: ${ticker}
🏆 Final Score: ${openBoxData.finalScore}/100
⚡ Action: ${action}

📊 PILLAR BREAKDOWN
Fundamentals: ${p.fundamentals}/30
Market Dynamics: ${p.marketDynamics}/15
Balance Sheet: ${p.balanceSheet}/15
Leadership: ${p.leadership}/15
Innovation: ${p.innovation}/15
Ethics: ${p.ethics}/10

⚠️ RISK FLAGS
${riskText}

🧠 NARRATIVE
${narrative}

_Was this score helpful?_
  `.trim();

  await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
    Markup.button.callback('👍 Accurate', `feedback:${eventId}:1`),
    Markup.button.callback('👎 Off', `feedback:${eventId}:-1`),
  ]));
}

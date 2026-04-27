import { Context, Markup } from 'telegraf';
import { BotContext, OpenBoxResult } from '../types';
import { stockwise } from '../api/stockwise';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { yahooSearch, getHistoricalPrices } from '../api/yahoo';
import { databento } from '../api/databento';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function fetchLivePrice(ticker: string): Promise<number> {
  const upper = ticker.toUpperCase();

  // 1. Yahoo search — some results include price
  try {
    const search = await yahooSearch(upper);
    if (search.data && search.data.length > 0) {
      const first = search.data[0] as any;
      if (first.price && Number(first.price) > 0) {
        return Number(first.price);
      }
    }
  } catch { /* ignore */ }

  // 2. Yahoo quoteSummary price module
  try {
    const summary = await yf.quoteSummary(upper, { modules: ['price'] });
    const price = (summary as any)?.price?.regularMarketPrice;
    if (price && Number(price) > 0) {
      return Number(price);
    }
  } catch { /* ignore */ }

  // 3. Yahoo historical prices — last close
  try {
    const hist = await getHistoricalPrices(upper, '1y');
    if (hist.data && hist.data.length > 0) {
      const last = hist.data[hist.data.length - 1];
      if (last.close && last.close > 0) {
        return last.close;
      }
    }
  } catch { /* ignore */ }

  // 4. Databento latest trade
  try {
    const trade = await databento.getLatestTrade(upper);
    if (trade && trade.price > 0) {
      return trade.price;
    }
  } catch { /* ignore */ }

  return 0;
}

function getAction(finalScore: number): string {
  if (finalScore >= 85) return 'aggressive buy';
  if (finalScore >= 70) return 'core holding';
  if (finalScore >= 55) return 'tactical / watch';
  return 'avoid / exit';
}

function formatPrice(price: number | undefined | string): string {
  const n = Number(price);
  if (Number.isFinite(n) && n > 0) {
    return '$' + n.toFixed(2);
  }
  return 'Price unavailable';
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

  const apiStart = Date.now();

  // 1. Try StockWisePro API first
  const { data, error } = await stockwise.getStockScore(ticker, telegramId);
  let openBoxData: OpenBoxResult | null = null;
  let price: number | undefined;

  if (!error && data) {
    const s = data as any;
    // Extract price from API response if available
    if (s.price && Number(s.price) > 0) {
      price = Number(s.price);
    }
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

  // 3. Ensure we have a price
  if (!price || price === 0) {
    const livePrice = await fetchLivePrice(ticker);
    if (livePrice > 0) {
      price = livePrice;
    }
  }

  const totalDuration = Date.now() - apiStart;
  Object.assign(ctx.state, { ticker, apiDuration: totalDuration, success: !!openBoxData });
  if (!openBoxData) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  const eventId = (ctx as BotContext).state.eventId as number;

  // 4. Scoring fully failed — still show price
  if (!openBoxData) {
    const priceStr = formatPrice(price);
    await ctx.reply(`❌ Scoring failed for ${ticker}.\n🏷 Price: ${priceStr}\n\nTry again later or check the ticker.`);
    return;
  }

  // Ethics hard filter
  if (!openBoxData.ethicsPass) {
    const priceStr = formatPrice(price);
    await ctx.reply(`🚫 ETHICS BLOCK: ${openBoxData.riskFlags.join(', ')}. This stock is excluded from scoring.\n\n🏷 Price: ${priceStr}`);
    return;
  }

  const p = openBoxData.pillars;
  const action = getAction(openBoxData.finalScore);
  const priceStr = formatPrice(price);

  const riskText = openBoxData.riskFlags.length > 0
    ? openBoxData.riskFlags.map(f => `• ${f}`).join('\n')
    : 'None detected';

  const msg = `
📊 OPENBOX SCORE: ${ticker}
🏷 Price: ${priceStr}
🏆 Final Score: ${openBoxData.finalScore}/100
⚡ Action: ${action}

📊 PILLAR BREAKDOWN
Fundamentals: ${Math.round(p.fundamentals * 100 / 30)}/100 (weight: 30%)
Market Dynamics: ${Math.round(p.marketDynamics * 100 / 15)}/100 (weight: 15%)
Balance Sheet: ${Math.round(p.balanceSheet * 100 / 15)}/100 (weight: 15%)
Leadership: ${Math.round(p.leadership * 100 / 15)}/100 (weight: 15%)
Innovation: ${Math.round(p.innovation * 100 / 15)}/100 (weight: 15%)
Ethics: ${p.ethics === 10 ? 'PASS' : 'FAIL'}/10

⚠️ RISK FLAGS
${riskText}

🧠 NARRATIVE
${openBoxData.narrative}

_Was this score helpful?_
  `.trim();

  await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
    Markup.button.callback('👍 Accurate', `feedback:${eventId}:1`),
    Markup.button.callback('👎 Off', `feedback:${eventId}:-1`),
  ]));
}

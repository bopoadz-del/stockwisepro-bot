import { Context, Markup } from 'telegraf';
import { BotContext, OpenBoxResult } from '../types';
import { stockwise } from '../api/stockwise';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { yahooSearch, getHistoricalPrices } from '../api/yahoo';
import { databento } from '../api/databento';
import { alpaca } from '../api/alpaca';
import { fmp } from '../api/fmp';
import { userSafeError, logger } from '../utils/logger';
import { validateTicker } from '../utils/validation';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// In-memory cache for Yahoo quoteSummary to avoid 429 rate limits
const quoteSummaryCache = new Map<string, { data: any; expires: number }>();
const QUOTE_SUMMARY_TTL_MS = 5 * 60 * 1000;

function getCachedQuoteSummary(ticker: string): any | null {
  const entry = quoteSummaryCache.get(ticker.toUpperCase());
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    quoteSummaryCache.delete(ticker.toUpperCase());
    return null;
  }
  return entry.data;
}

function setCachedQuoteSummary(ticker: string, data: any): void {
  quoteSummaryCache.set(ticker.toUpperCase(), { data, expires: Date.now() + QUOTE_SUMMARY_TTL_MS });
}

async function fetchQuoteSummary(ticker: string, modules: string[]): Promise<any> {
  const upper = ticker.toUpperCase();
  const cacheKey = upper + ':' + modules.sort().join(',');
  const cached = getCachedQuoteSummary(cacheKey);
  if (cached) return cached;
  const result = await yf.quoteSummary(upper, { modules: modules as any });
  setCachedQuoteSummary(cacheKey, result);
  return result;
}

const PRICE_FETCH_TIMEOUT_MS = 3000;

type PriceSource =
  | { name: 'yahoo_search'; price: number }
  | { name: 'yahoo_quote'; price: number }
  | { name: 'yahoo_history'; price: number }
  | { name: 'fmp'; price: number }
  | { name: 'databento'; price: number }
  | { name: 'alpaca'; price: number };

async function fetchLivePrice(ticker: string): Promise<number> {
  const upper = ticker.toUpperCase();

  const withTimeout = <T>(name: string, promise: Promise<T | null | undefined>): Promise<T | null> =>
    Promise.race([
      promise.then((v) => v ?? null).catch((err) => {
        logger.warn(`Price fetch ${name} failed`, { ticker: upper, error: String(err) });
        return null;
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          logger.warn(`Price fetch ${name} timed out`, { ticker: upper });
          resolve(null);
        }, PRICE_FETCH_TIMEOUT_MS)
      ),
    ]);

  const candidates: Array<() => Promise<PriceSource | null>> = [
    async () => {
      const search = await withTimeout('yahoo_search', yahooSearch(upper));
      const first = search?.data?.[0] as any;
      const price = first?.price ? Number(first.price) : 0;
      return price > 0 ? { name: 'yahoo_search', price } : null;
    },
    async () => {
      const summary = await withTimeout('yahoo_quote', fetchQuoteSummary(upper, ['price']));
      const price = Number((summary as any)?.price?.regularMarketPrice) || 0;
      return price > 0 ? { name: 'yahoo_quote', price } : null;
    },
    async () => {
      const hist = await withTimeout('yahoo_history', getHistoricalPrices(upper, '1y'));
      const last = hist?.data?.[hist.data.length - 1];
      const price = last?.close ?? 0;
      return price > 0 ? { name: 'yahoo_history', price } : null;
    },
    async () => {
      const quote = await withTimeout('fmp', fmp.getQuote(upper));
      const price = quote?.price ?? 0;
      return price > 0 ? { name: 'fmp', price } : null;
    },
    async () => {
      const trade = await withTimeout('databento', databento.getLatestTrade(upper));
      const price = trade?.price ?? 0;
      return price > 0 ? { name: 'databento', price } : null;
    },
    async () => {
      const price = await withTimeout('alpaca', alpaca.getLatestTrade(upper));
      const safePrice = price ?? 0;
      return safePrice > 0 ? { name: 'alpaca', price: safePrice } : null;
    },
  ];

  // Run all price sources concurrently; the first successful one wins
  const promises = candidates.map((fn) => fn());
  const results = await Promise.all(promises);
  const winner = results.find((r): r is PriceSource => r !== null);

  if (winner) {
    logger.info(`Price fetched for ${upper}`, { source: winner.name, price: winner.price });
    return winner.price;
  }

  logger.warn(`All price sources failed for ${upper}`);
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

  // Always use local OpenBox engine with fresh Yahoo Finance data
  // (StockWise API scoring endpoint is broken — 404)
  let openBoxData: OpenBoxResult | null = null;
  let price: number | undefined;

  const localResult = await computeOpenBoxScore(ticker, telegramId);
  if (localResult) {
    openBoxData = localResult;
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
  if (!openBoxData) (ctx as BotContext).state.errorMessage = 'OpenBox engine failed to compute score';
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
  const isETF = openBoxData.isETF;

  const riskText = openBoxData.riskFlags.length > 0
    ? openBoxData.riskFlags.map(f => `• ${f}`).join('\n')
    : 'None detected';

  // Normalized percentages using base weights
  const fundPct = Math.min(Math.round(p.fundamentals * 100 / 30), 100);
  const marketPct = Math.min(Math.round(p.marketDynamics * 100 / 15), 100);
  const balancePct = Math.min(Math.round(p.balanceSheet * 100 / 15), 100);
  const leadPct = Math.min(Math.round(p.leadership * 100 / 15), 100);
  const innovPct = Math.min(Math.round(p.innovation * 100 / 15), 100);

  const innovLine = isETF
    ? `Innovation: — (weight: 15%) — redistributed to other pillars`
    : `Innovation: ${innovPct}/100 (weight: 15%)`;

  const msg = `
📊 OPENBOX SCORE: ${ticker}
🏷 Price: ${priceStr}
🏆 Final Score: ${openBoxData.finalScore}/100
⚡ Action: ${action}

📊 PILLAR BREAKDOWN
Fundamentals: ${fundPct}/100 (weight: 30%)
Market Dynamics: ${marketPct}/100 (weight: 15%)
Balance Sheet: ${balancePct}/100 (weight: 15%)
Leadership: ${leadPct}/100 (weight: 15%)
${innovLine}
Ethics: ${p.ethics === 10 ? 'PASS' : 'FAIL'}/10 (weight: 10%)

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

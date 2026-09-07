import { logger } from '../utils/logger';
import { stockwise } from '../api/stockwise';
import { screenPortfolio, findReplacement, ScreenResult } from './screener';
import { buildPortfolioFromSheet, findReplacementCandidates } from './sheet_engine';
import { checkEthics } from './openbox/ethics';
import { getStockByTicker } from './universe';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

export interface MimicHolding {
  ticker: string;
  percentage: number;
}

export interface MimicResult {
  holdings: MimicHolding[];
  investorName: string;
  ethicsApplied: boolean;
  replacedTickers?: Array<{ old: string; new: string; reason: string }>;
}

export interface MimicInvestorMeta {
  id: string;
  name: string;
  style: string;
}

/** Named investors shown in /mimic. Every id must have a complete EXAMPLE_PORTFOLIOS entry. */
export const MIMIC_INVESTORS: MimicInvestorMeta[] = [
  { id: 'buffett', name: 'Warren Buffett', style: 'Value' },
  { id: 'dalio', name: 'Ray Dalio', style: 'All Weather' },
  { id: 'wood', name: 'Cathie Wood', style: 'Growth/Innovation' },
  { id: 'lynch', name: 'Peter Lynch', style: 'Growth at Reasonable Price' },
  { id: 'graham', name: 'Benjamin Graham', style: 'Deep Value' },
  { id: 'templeton', name: 'John Templeton', style: 'Contrarian' },
  { id: 'burry', name: 'Michael Burry', style: 'Deep Value' },
  { id: 'ackman', name: 'Bill Ackman', style: 'Activist' },
  { id: 'soros', name: 'George Soros', style: 'Global Macro' },
  { id: 'druckenmiller', name: 'Stanley Druckenmiller', style: 'Concentrated Growth' },
  { id: 'marks', name: 'Howard Marks', style: 'Credit / Distressed' },
  { id: 'simons', name: 'Jim Simons', style: 'Quantitative' },
  { id: 'icahn', name: 'Carl Icahn', style: 'Activist' },
];

export const MIMIC_INVESTOR_IDS = MIMIC_INVESTORS.map(i => i.id);

function normalizeHoldings(holdings: MimicHolding[]): MimicHolding[] {
  const total = holdings.reduce((sum, h) => sum + h.percentage, 0);
  if (total === 0) return holdings;
  const normalized = holdings.map(h => ({
    ticker: h.ticker,
    percentage: parseFloat(((h.percentage / total) * 100).toFixed(2)),
  }));
  const current = normalized.reduce((sum, h) => sum + h.percentage, 0);
  const diff = parseFloat((100 - current).toFixed(2));
  if (diff !== 0 && normalized.length > 0) {
    const largestIdx = normalized.reduce((maxIdx, h, i, arr) =>
      h.percentage > arr[maxIdx].percentage ? i : maxIdx, 0);
    normalized[largestIdx].percentage = parseFloat(
      (normalized[largestIdx].percentage + diff).toFixed(2)
    );
  }
  return normalized;
}

const EXAMPLE_PORTFOLIOS: Record<string, MimicResult> = {
  dalio: {
    investorName: 'Ray Dalio',
    ethicsApplied: false,
    holdings: [
      { ticker: 'SPY', percentage: 8 },
      { ticker: 'VTI', percentage: 8 },
      { ticker: 'AAPL', percentage: 7.56 },
      { ticker: 'MSFT', percentage: 7.56 },
      { ticker: 'JPM', percentage: 6.3 },
      { ticker: 'BAC', percentage: 6.3 },
      { ticker: 'UNH', percentage: 5.04 },
      { ticker: 'JNJ', percentage: 5.04 },
      { ticker: 'PG', percentage: 8.4 },
      { ticker: 'GE', percentage: 8.4 },
      { ticker: 'XOM', percentage: 6.72 },
      { ticker: 'HD', percentage: 6.72 },
      { ticker: 'CMCSA', percentage: 5.88 },
      { ticker: 'LIN', percentage: 4.2 },
      { ticker: 'AMT', percentage: 3.36 },
      { ticker: 'NEE', percentage: 2.52 },
    ],
  },
  buffett: {
    investorName: 'Warren Buffett',
    ethicsApplied: false,
    holdings: [
      { ticker: 'AAPL', percentage: 25 },
      { ticker: 'BAC', percentage: 12 },
      { ticker: 'AXP', percentage: 10 },
      { ticker: 'KO', percentage: 8 },
      { ticker: 'OXY', percentage: 7 },
      { ticker: 'KHC', percentage: 6 },
      { ticker: 'CVX', percentage: 6 },
      { ticker: 'USB', percentage: 4 },
      { ticker: 'HPQ', percentage: 4 },
      { ticker: 'PARA', percentage: 3.5 },
      { ticker: 'MCO', percentage: 3.5 },
      { ticker: 'V', percentage: 3.5 },
      { ticker: 'MA', percentage: 3 },
      { ticker: 'JNJ', percentage: 2.5 },
      { ticker: 'PG', percentage: 2.5 },
    ],
  },
  wood: {
    investorName: 'Cathie Wood',
    ethicsApplied: false,
    holdings: [
      { ticker: 'TSLA', percentage: 12 },
      { ticker: 'COIN', percentage: 10 },
      { ticker: 'ROKU', percentage: 8 },
      { ticker: 'XYZ', percentage: 8 },
      { ticker: 'ZM', percentage: 8 },
      { ticker: 'EXAS', percentage: 7 },
      { ticker: 'TDOC', percentage: 7 },
      { ticker: 'PATH', percentage: 6 },
      { ticker: 'CRSP', percentage: 6 },
      { ticker: 'NTLA', percentage: 5 },
      { ticker: 'BEAM', percentage: 5 },
      { ticker: 'PACB', percentage: 5 },
      { ticker: 'TWST', percentage: 4.5 },
      { ticker: 'VCYT', percentage: 4.5 },
      { ticker: 'SSYS', percentage: 4 },
      { ticker: 'TRMB', percentage: 4 },
    ],
  },
  burry: {
    investorName: 'Michael Burry',
    ethicsApplied: false,
    holdings: [
      { ticker: 'JD', percentage: 18 },
      { ticker: 'BABA', percentage: 15 },
      { ticker: 'GOOGL', percentage: 12 },
      { ticker: 'CVS', percentage: 10 },
      { ticker: 'CI', percentage: 10 },
      { ticker: 'HCA', percentage: 8 },
      { ticker: 'MU', percentage: 7 },
      { ticker: 'BLK', percentage: 6 },
      { ticker: 'WFC', percentage: 5 },
      { ticker: 'GM', percentage: 4.5 },
      { ticker: 'STLA', percentage: 4.5 },
    ],
  },
  ackman: {
    investorName: 'Bill Ackman',
    ethicsApplied: false,
    holdings: [
      { ticker: 'HLT', percentage: 18 },
      { ticker: 'CMG', percentage: 16 },
      { ticker: 'QSR', percentage: 14 },
      { ticker: 'LOW', percentage: 12 },
      { ticker: 'GOOGL', percentage: 10 },
      { ticker: 'UBER', percentage: 8 },
      { ticker: 'CP', percentage: 7 },
      { ticker: 'NKE', percentage: 6 },
      { ticker: 'HHH', percentage: 5 },
      { ticker: 'BN', percentage: 4 },
    ],
  },
  congress: {
    investorName: 'Nancy Pelosi',
    ethicsApplied: false,
    holdings: [
      { ticker: 'AAPL', percentage: 20 },
      { ticker: 'MSFT', percentage: 15 },
      { ticker: 'GOOGL', percentage: 12 },
      { ticker: 'NVDA', percentage: 12 },
      { ticker: 'AMZN', percentage: 10 },
      { ticker: 'TSLA', percentage: 8 },
      { ticker: 'CRM', percentage: 7 },
      { ticker: 'DIS', percentage: 6 },
      { ticker: 'RBLX', percentage: 5.5 },
      { ticker: 'AXP', percentage: 4.5 },
    ],
  },
  lynch: {
    investorName: 'Peter Lynch',
    ethicsApplied: false,
    holdings: [
      { ticker: 'F', percentage: 12 },
      { ticker: 'GE', percentage: 10 },
      { ticker: 'KO', percentage: 10 },
      { ticker: 'WMT', percentage: 10 },
      { ticker: 'PG', percentage: 8 },
      { ticker: 'MO', percentage: 8 },
      { ticker: 'XOM', percentage: 7 },
      { ticker: 'IBM', percentage: 7 },
      { ticker: 'BAC', percentage: 7 },
      { ticker: 'JNJ', percentage: 6 },
      { ticker: 'PEP', percentage: 5 },
      { ticker: 'MMM', percentage: 5 },
      { ticker: 'T', percentage: 5 },
    ],
  },
  graham: {
    investorName: 'Benjamin Graham',
    ethicsApplied: false,
    holdings: [
      { ticker: 'BRK.B', percentage: 15 },
      { ticker: 'JNJ', percentage: 12 },
      { ticker: 'PG', percentage: 10 },
      { ticker: 'KO', percentage: 10 },
      { ticker: 'WMT', percentage: 10 },
      { ticker: 'XOM', percentage: 8 },
      { ticker: 'CVX', percentage: 8 },
      { ticker: 'IBM', percentage: 7 },
      { ticker: 'T', percentage: 7 },
      { ticker: 'GE', percentage: 7 },
      { ticker: 'INTC', percentage: 6 },
    ],
  },
  templeton: {
    investorName: 'John Templeton',
    ethicsApplied: false,
    holdings: [
      { ticker: 'INTC', percentage: 12 },
      { ticker: 'MU', percentage: 10 },
      { ticker: 'TSM', percentage: 10 },
      { ticker: 'BABA', percentage: 10 },
      { ticker: 'JD', percentage: 8 },
      { ticker: 'SAP', percentage: 8 },
      { ticker: 'SIEGY', percentage: 7 },
      { ticker: 'SONY', percentage: 7 },
      { ticker: 'TM', percentage: 7 },
      { ticker: 'NVO', percentage: 6 },
      { ticker: 'SHEL', percentage: 6 },
      { ticker: 'BP', percentage: 5 },
      { ticker: 'GSK', percentage: 4 },
    ],
  },
  soros: {
    investorName: 'George Soros',
    ethicsApplied: false,
    holdings: [
      { ticker: 'QQQ', percentage: 18 },
      { ticker: 'SPY', percentage: 15 },
      { ticker: 'IWM', percentage: 12 },
      { ticker: 'EEM', percentage: 10 },
      { ticker: 'TLT', percentage: 8 },
      { ticker: 'GLD', percentage: 8 },
      { ticker: 'FXI', percentage: 7 },
      { ticker: 'EWJ', percentage: 6 },
      { ticker: 'HYG', percentage: 6 },
      { ticker: 'UUP', percentage: 5 },
      { ticker: 'SLV', percentage: 5 },
    ],
  },
  druckenmiller: {
    investorName: 'Stanley Druckenmiller',
    ethicsApplied: false,
    holdings: [
      { ticker: 'NVDA', percentage: 14 },
      { ticker: 'MSFT', percentage: 12 },
      { ticker: 'GOOGL', percentage: 10 },
      { ticker: 'AMZN', percentage: 9 },
      { ticker: 'META', percentage: 8 },
      { ticker: 'AVGO', percentage: 8 },
      { ticker: 'TSM', percentage: 7 },
      { ticker: 'LLY', percentage: 7 },
      { ticker: 'AMAT', percentage: 6 },
      { ticker: 'CRWD', percentage: 5 },
      { ticker: 'NFLX', percentage: 5 },
      { ticker: 'V', percentage: 5 },
      { ticker: 'UNH', percentage: 4 },
    ],
  },
  marks: {
    investorName: 'Howard Marks',
    ethicsApplied: false,
    holdings: [
      { ticker: 'HYG', percentage: 18 },
      { ticker: 'JNK', percentage: 14 },
      { ticker: 'SJNK', percentage: 12 },
      { ticker: 'BKLN', percentage: 12 },
      { ticker: 'LQD', percentage: 10 },
      { ticker: 'SPY', percentage: 10 },
      { ticker: 'EMB', percentage: 8 },
      { ticker: 'BAC', percentage: 6 },
      { ticker: 'JPM', percentage: 5 },
      { ticker: 'WFC', percentage: 5 },
    ],
  },
  simons: {
    investorName: 'Jim Simons',
    ethicsApplied: false,
    holdings: [
      { ticker: 'NVDA', percentage: 8 },
      { ticker: 'META', percentage: 7 },
      { ticker: 'AMZN', percentage: 7 },
      { ticker: 'GOOGL', percentage: 6 },
      { ticker: 'MSFT', percentage: 6 },
      { ticker: 'AAPL', percentage: 6 },
      { ticker: 'AVGO', percentage: 5 },
      { ticker: 'LLY', percentage: 5 },
      { ticker: 'UNH', percentage: 5 },
      { ticker: 'JPM', percentage: 5 },
      { ticker: 'V', percentage: 5 },
      { ticker: 'MA', percentage: 5 },
      { ticker: 'COST', percentage: 5 },
      { ticker: 'HD', percentage: 5 },
      { ticker: 'XOM', percentage: 5 },
      { ticker: 'JNJ', percentage: 5 },
      { ticker: 'PG', percentage: 5 },
      { ticker: 'MRK', percentage: 5 },
    ],
  },
  icahn: {
    investorName: 'Carl Icahn',
    ethicsApplied: false,
    holdings: [
      { ticker: 'IEP', percentage: 28 },
      { ticker: 'CVI', percentage: 14 },
      { ticker: 'OXY', percentage: 12 },
      { ticker: 'SWX', percentage: 10 },
      { ticker: 'XRX', percentage: 8 },
      { ticker: 'NFE', percentage: 7 },
      { ticker: 'IFF', percentage: 7 },
      { ticker: 'AAPL', percentage: 6 },
      { ticker: 'ILMN', percentage: 4 },
      { ticker: 'HHH', percentage: 4 },
    ],
  },
};

for (const key of Object.keys(EXAMPLE_PORTFOLIOS)) {
  EXAMPLE_PORTFOLIOS[key] = {
    ...EXAMPLE_PORTFOLIOS[key],
    holdings: normalizeHoldings(EXAMPLE_PORTFOLIOS[key].holdings),
  };
}

function resolveHardcodedKey(investorId: string): string {
  if (investorId.startsWith('congress:')) return 'congress';
  return investorId;
}

function applyEthicsToHoldings(holdings: MimicHolding[]): MimicHolding[] {
  const kept = holdings.filter(h => {
    const stock = getStockByTicker(h.ticker);
    return checkEthics(h.ticker, stock?.sector, '', stock?.name).pass;
  });
  return normalizeHoldings(kept);
}

function applyUserReplacements(
  holdings: MimicHolding[],
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): { holdings: MimicHolding[]; replacedTickers?: Array<{ old: string; new: string; reason: string }> } {
  if (!userReplacements || userReplacements.length === 0) {
    return { holdings };
  }
  const next = holdings.map(h => ({ ...h }));
  const replaced: Array<{ old: string; new: string; reason: string }> = [];
  for (const rep of userReplacements) {
    if (!rep.newTicker) continue;
    const idx = next.findIndex(h => h.ticker.toUpperCase() === rep.oldTicker.toUpperCase());
    if (idx === -1) continue;
    next[idx] = { ticker: rep.newTicker.toUpperCase(), percentage: next[idx].percentage };
    replaced.push({ old: rep.oldTicker.toUpperCase(), new: rep.newTicker.toUpperCase(), reason: 'user replacement' });
  }
  return { holdings: next, replacedTickers: replaced.length > 0 ? replaced : undefined };
}

export function getHardcodedMimicAllocation(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): MimicResult | null {
  const key = resolveHardcodedKey(investorId);
  const hardcoded = EXAMPLE_PORTFOLIOS[key];
  if (!hardcoded) return null;

  let holdings = hardcoded.holdings.map(h => ({ ...h }));
  if (ethicsEnabled) {
    holdings = applyEthicsToHoldings(holdings);
    if (holdings.length === 0) return null;
  }
  const replaced = applyUserReplacements(holdings, userReplacements);
  return {
    investorName: hardcoded.investorName,
    ethicsApplied: ethicsEnabled,
    holdings: replaced.holdings,
    replacedTickers: replaced.replacedTickers,
  };
}

export function getLocalMimicAllocation(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): MimicResult | null {
  try {
    const sheetResult = buildPortfolioFromSheet(investorId, ethicsEnabled, userReplacements);
    if (sheetResult && sheetResult.holdings.length > 0) {
      return {
        holdings: sheetResult.holdings.map(h => ({ ticker: h.ticker, percentage: h.percentage })),
        investorName: sheetResult.investorName,
        ethicsApplied: sheetResult.ethicsApplied,
        replacedTickers: sheetResult.replacedTickers,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Sheet engine crashed, falling back', { error: msg, investorId });
  }

  try {
    const result = screenPortfolio(investorId, ethicsEnabled, userReplacements);
    if (result && result.holdings.length > 0) {
      return {
        holdings: result.holdings.map(h => ({ ticker: h.ticker, percentage: h.percentage })),
        investorName: result.investorName,
        ethicsApplied: result.ethicsApplied,
        replacedTickers: result.replacedTickers,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Screener crashed, using hardcoded fallback', { error: msg, investorId });
  }

  const hardcoded = getHardcodedMimicAllocation(investorId, ethicsEnabled, userReplacements);
  if (hardcoded) {
    logger.info('Using hardcoded portfolio', { investorId });
    return hardcoded;
  }

  logger.error('No portfolio available for investor', { investorId });
  return null;
}

export function getMimicInvestorName(investorId: string): string | undefined {
  if (investorId.startsWith('congress:')) return undefined;
  return MIMIC_INVESTORS.find(i => i.id === investorId)?.name
    || EXAMPLE_PORTFOLIOS[investorId]?.investorName;
}

/** Yahoo / vendor symbols: BRK.B and BRK_B both become BRK-B. */
export function toYahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/[._]/g, '-');
}

function readPositivePrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  const symbol = toYahooSymbol(ticker);
  try {
    const quote = await yf.quote(symbol);
    const fromQuote = readPositivePrice(
      (quote as any)?.regularMarketPrice ?? (quote as any)?.regularMarketPreviousClose
    );
    if (fromQuote) return fromQuote;
  } catch {
    // try quoteSummary
  }
  try {
    const summary = await fetchQuoteSummary(symbol, ['price']);
    const fromSummary = readPositivePrice(
      (summary as any)?.price?.regularMarketPrice ?? (summary as any)?.price?.previousClose
    );
    if (fromSummary) return fromSummary;
  } catch {
    // no quote
  }
  return null;
}

export async function fetchMimicPrices(
  holdings: MimicHolding[],
  telegramId?: number
): Promise<Map<string, number | null>> {
  const priceMap = new Map<string, number | null>();

  const pricePromises = holdings.map(async (h) => {
    try {
      const res = await stockwise.getStock(h.ticker, telegramId);
      const price = readPositivePrice(
        res.data?.price ?? res.data?.currentPrice ?? res.data?.regularMarketPrice
      );
      if (price) {
        return { ticker: h.ticker, price };
      }
    } catch {
      // fall through to Yahoo
    }

    const yahooPrice = await fetchYahooPrice(h.ticker);
    return { ticker: h.ticker, price: yahooPrice };
  });

  const prices = await Promise.all(pricePromises);
  prices.forEach((p) => {
    priceMap.set(p.ticker, p.price);
  });
  return priceMap;
}

export interface AllocatedHolding {
  ticker: string;
  percentage: number;
  price: number | null;
  shares: number;
  value: number;
  quoted: boolean;
}

export interface MimicAllocation {
  holdings: AllocatedHolding[];
  totalAllocated: number;
  residualCash: number;
  unquotedTickers: string[];
  quotedCount: number;
}

/**
 * Convert target weights + live quotes into whole-share lots.
 * Unquoted names stay at 0 shares; that budget becomes residual cash.
 * Never invents a price.
 */
export function allocateMimicBudget(
  holdings: MimicHolding[],
  amount: number,
  priceMap: Map<string, number | null>
): MimicAllocation {
  const allocated: AllocatedHolding[] = holdings.map(h => {
    const price = priceMap.get(h.ticker) ?? null;
    const quoted = price !== null && price > 0;
    const budget = amount * (h.percentage / 100);
    if (!quoted || !price) {
      return { ticker: h.ticker, percentage: h.percentage, price: null, shares: 0, value: 0, quoted: false };
    }
    const shares = Math.floor(budget / price);
    const value = shares * price;
    return { ticker: h.ticker, percentage: h.percentage, price, shares, value, quoted: true };
  });

  const totalAllocated = allocated.reduce((sum, h) => sum + h.value, 0);
  const residualCash = parseFloat((amount - totalAllocated).toFixed(2));
  const unquotedTickers = allocated.filter(h => !h.quoted).map(h => h.ticker);

  return {
    holdings: allocated,
    totalAllocated: parseFloat(totalAllocated.toFixed(2)),
    residualCash,
    unquotedTickers,
    quotedCount: allocated.filter(h => h.quoted).length,
  };
}

export function listHardcodedInvestorIds(): string[] {
  return Object.keys(EXAMPLE_PORTFOLIOS).filter(id => id !== 'congress');
}

export { findReplacement, findReplacementCandidates };
export type { ScreenResult };

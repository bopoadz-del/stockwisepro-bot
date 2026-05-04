import { logger } from '../utils/logger';
import { stockwise } from '../api/stockwise';
import { screenPortfolio, findReplacement, ScreenResult } from './screener';
import { buildPortfolioFromSheet, findReplacementCandidates } from './sheet_engine';
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

// Hardcoded example portfolios — guaranteed to work even if screener/API fails
const EXAMPLE_PORTFOLIOS: Record<string, MimicResult> = {
  dalio: {
    investorName: 'Ray Dalio',
    ethicsApplied: true,
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
    ethicsApplied: true,
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
      { ticker: 'MA', percentage: 3.5 },
      { ticker: 'JNJ', percentage: 2.5 },
      { ticker: 'PG', percentage: 2.5 },
    ],
  },
  wood: {
    investorName: 'Cathie Wood',
    ethicsApplied: true,
    holdings: [
      { ticker: 'TSLA', percentage: 12 },
      { ticker: 'COIN', percentage: 10 },
      { ticker: 'ROKU', percentage: 8 },
      { ticker: 'SQ', percentage: 8 },
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
    ethicsApplied: true,
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
    ethicsApplied: true,
    holdings: [
      { ticker: 'CP', percentage: 18 },
      { ticker: 'HLT', percentage: 15 },
      { ticker: 'GOOGL', percentage: 12 },
      { ticker: 'QSR', percentage: 10 },
      { ticker: 'HCMLF', percentage: 10 },
      { ticker: 'NKE', percentage: 9 },
      { ticker: 'LOW', percentage: 8 },
      { ticker: 'A', percentage: 7 },
      { ticker: 'HHC', percentage: 6.5 },
      { ticker: 'BN', percentage: 4.5 },
    ],
  },
  congress: {
    investorName: 'Nancy Pelosi',
    ethicsApplied: true,
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
    ethicsApplied: true,
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
    ethicsApplied: true,
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
    ethicsApplied: true,
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
};

export function getLocalMimicAllocation(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): MimicResult | null {
  // 1. Try sheet engine first (formula-based portfolio builder)
  try {
    const sheetResult = buildPortfolioFromSheet(investorId, ethicsEnabled, userReplacements);
    if (sheetResult) {
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

  // 2. Try legacy screener
  try {
    const result = screenPortfolio(investorId, ethicsEnabled, userReplacements);
    if (result) {
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

  // 3. Ultimate fallback: hardcoded portfolio
  const hardcoded = EXAMPLE_PORTFOLIOS[investorId];
  if (hardcoded) {
    logger.info('Using hardcoded portfolio', { investorId });
    return { ...hardcoded, ethicsApplied: ethicsEnabled };
  }

  logger.error('No portfolio available for investor', { investorId });
  return null;
}

// Hardcoded prices as fallback when all APIs fail
const HARDCODED_PRICES: Record<string, number> = {
  SPY: 711.58, VTI: 350.21, AAPL: 270.17, MSFT: 424.46, JPM: 309.25,
  BAC: 52.88, UNH: 370.74, JNJ: 227.35, PG: 146.46, GE: 283.57,
  XOM: 154.67, HD: 322.81, CMCSA: 26.76, LIN: 504.71, AMT: 178.19,
  NEE: 94.17, AXP: 324.50, KO: 72.50, OXY: 52.30, KHC: 36.80,
  CVX: 147.20, USB: 48.30, HPQ: 32.10, PARA: 11.80, MCO: 428.50,
  V: 312.40, MA: 485.20, TSLA: 248.50, COIN: 198.40, ROKU: 72.30,
  SQ: 87.50, ZM: 72.40, EXAS: 92.10, TDOC: 15.80, PATH: 12.50,
  CRSP: 48.20, NTLA: 23.40, BEAM: 28.60, PACB: 1.85, TWST: 68.40,
  VCYT: 38.20, SSYS: 6.40, TRMB: 72.80, JD: 37.50, BABA: 85.20,
  GOOGL: 175.30, CVS: 57.80, CI: 345.20, HCA: 310.50, MU: 98.40,
  BLK: 915.20, WFC: 58.30, GM: 48.50, STLA: 14.20, CP: 84.30,
  HLT: 245.60, QSR: 72.80, HCMLF: 12.40, NKE: 82.50, LOW: 232.40,
  A: 155.30, HHC: 88.50, BN: 52.30, NVDA: 128.40, AMZN: 198.50,
  CRM: 285.40, DIS: 98.50, RBLX: 48.30,
  // Additional tickers for Lynch, Graham, Templeton
  F: 12.50, WMT: 98.20, MO: 48.30, IBM: 228.40, PEP: 172.50, MMM: 142.80,
  'BRK.B': 489.50, T: 22.80, INTC: 20.50, TSM: 192.30, SAP: 272.40,
  SIEGY: 92.10, SONY: 22.40, TM: 175.20, NVO: 142.80, SHEL: 71.50,
  BP: 35.20, GSK: 42.80,
};

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const summary = await fetchQuoteSummary(ticker.toUpperCase(), ['price']);
    const price = (summary as any)?.price?.regularMarketPrice ?? (summary as any)?.price?.previousClose ?? null;
    if (price && Number(price) > 0) return Number(price);
  } catch {
    // ignore
  }
  return null;
}

export async function fetchMimicPrices(
  holdings: MimicHolding[],
  telegramId?: number
): Promise<Map<string, number | null>> {
  const priceMap = new Map<string, number | null>();

  const pricePromises = holdings.map(async (h) => {
    // 1. Try StockWise API first
    try {
      const res = await stockwise.getStock(h.ticker, telegramId);
      const price = res.data?.price ?? res.data?.currentPrice ?? res.data?.regularMarketPrice ?? null;
      if (price && parseFloat(price) > 0) {
        return { ticker: h.ticker, price: parseFloat(price) };
      }
    } catch {
      // fall through to Yahoo
    }

    // 2. Fallback to Yahoo Finance
    const yahooPrice = await fetchYahooPrice(h.ticker);
    if (yahooPrice) {
      return { ticker: h.ticker, price: yahooPrice };
    }

    return { ticker: h.ticker, price: null };
  });

  const prices = await Promise.all(pricePromises);
  prices.forEach((p) => {
    // Use fetched price, or hardcoded fallback, or null
    const finalPrice = p.price ?? HARDCODED_PRICES[p.ticker.toUpperCase()] ?? null;
    priceMap.set(p.ticker, finalPrice);
  });
  return priceMap;
}

export { findReplacement, findReplacementCandidates };
export type { ScreenResult };

import { logger } from '../utils/logger';
import { stockwise } from '../api/stockwise';
import { screenPortfolio, findReplacement, ScreenResult } from './screener';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

export function getLocalMimicAllocation(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): MimicResult | null {
  const result = screenPortfolio(investorId, ethicsEnabled, userReplacements);
  if (!result) {
    logger.warn('Screening returned null for investor', { investorId });
    return null;
  }

  return {
    holdings: result.holdings.map(h => ({ ticker: h.ticker, percentage: h.percentage })),
    investorName: result.investorName,
    ethicsApplied: result.ethicsApplied,
    replacedTickers: result.replacedTickers,
  };
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const summary = await yf.quoteSummary(ticker.toUpperCase(), { modules: ['price'] });
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
  prices.forEach((p) => priceMap.set(p.ticker, p.price));
  return priceMap;
}

export { findReplacement };
export type { ScreenResult };

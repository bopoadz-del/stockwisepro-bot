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
    const result = await yf.quote(ticker.toUpperCase());
    const price = (result as any)?.regularMarketPrice ?? (result as any)?.previousClose ?? null;
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

  // Batch fetch to avoid hammering Yahoo (max 5 concurrent)
  const BATCH_SIZE = 5;
  const TIMEOUT_MS = 8000; // per-holding timeout

  for (let i = 0; i < holdings.length; i += BATCH_SIZE) {
    const batch = holdings.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (h) => {
      // 1. Try StockWise API first (fast fail if down)
      try {
        const res = await stockwise.getStock(h.ticker, telegramId);
        const price = res.data?.price ?? res.data?.currentPrice ?? res.data?.regularMarketPrice ?? null;
        if (price && parseFloat(price) > 0) {
          return { ticker: h.ticker, price: parseFloat(price) };
        }
      } catch {
        // fall through to Yahoo
      }

      // 2. Fallback to Yahoo Finance with timeout
      try {
        const yahooPrice = await Promise.race([
          fetchYahooPrice(h.ticker),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Yahoo timeout')), TIMEOUT_MS)
          ),
        ]);
        if (yahooPrice) {
          return { ticker: h.ticker, price: yahooPrice };
        }
      } catch {
        // ignore — price will be null
      }

      return { ticker: h.ticker, price: null };
    });

    const prices = await Promise.all(promises);
    prices.forEach((p) => priceMap.set(p.ticker, p.price));
  }

  return priceMap;
}

export { findReplacement };
export type { ScreenResult };

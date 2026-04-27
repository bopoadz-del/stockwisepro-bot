import { logger } from '../utils/logger';
import { stockwise } from '../api/stockwise';
import { screenPortfolio, findReplacement, ScreenResult } from './screener';

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

export async function fetchMimicPrices(
  holdings: MimicHolding[],
  telegramId?: number
): Promise<Map<string, number | null>> {
  const priceMap = new Map<string, number | null>();

  const pricePromises = holdings.map(async (h) => {
    try {
      const res = await stockwise.getStock(h.ticker, telegramId);
      const price = res.data?.price ?? res.data?.currentPrice ?? res.data?.regularMarketPrice ?? null;
      return { ticker: h.ticker, price: price ? parseFloat(price) : null };
    } catch (e) {
      logger.warn(`Price fetch failed for ${h.ticker}`, { error: (e as Error).message });
      return { ticker: h.ticker, price: null };
    }
  });

  const prices = await Promise.all(pricePromises);
  prices.forEach((p) => priceMap.set(p.ticker, p.price));
  return priceMap;
}

export { findReplacement };
export type { ScreenResult };

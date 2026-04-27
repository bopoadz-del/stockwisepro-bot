import { logger } from '../utils/logger';
import { stockwise } from '../api/stockwise';

export interface MimicHolding {
  ticker: string;
  percentage: number;
}

export interface MimicResult {
  holdings: MimicHolding[];
  investorName: string;
}

// Hardcoded investor allocations (ported from StockWisePro backend)
// Weights are normalized to sum ~100%
const INVESTOR_ALLOCATIONS: Record<string, { name: string; holdings: Record<string, number> }> = {
  buffett: {
    name: 'Warren Buffett',
    holdings: { AAPL: 0.40, BAC: 0.15, KO: 0.10, AXP: 0.08, OXY: 0.07 },
  },
  dalio: {
    name: 'Ray Dalio',
    holdings: { SPY: 0.30, GLD: 0.15, TLT: 0.15, IEF: 0.10, VTI: 0.10 },
  },
  wood: {
    name: 'Cathie Wood',
    holdings: { TSLA: 0.20, ROKU: 0.08, SQ: 0.08, ZM: 0.07, COIN: 0.07 },
  },
  lynch: {
    name: 'Peter Lynch',
    holdings: { AAPL: 0.20, MSFT: 0.20, NVDA: 0.20, GOOGL: 0.20, JPM: 0.20 },
  },
  graham: {
    name: 'Benjamin Graham',
    holdings: { BRK_B: 0.25, JPM: 0.25, XOM: 0.20, CVX: 0.20, T: 0.10 },
  },
  templeton: {
    name: 'John Templeton',
    holdings: { TSM: 0.20, BABA: 0.20, INTC: 0.20, PBR: 0.20, VALE: 0.20 },
  },
};

function normalizeWeights(weights: Record<string, number>): MimicHolding[] {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return Object.entries(weights).map(([ticker, weight]) => ({
    ticker: ticker.replace('_', '-').toUpperCase(),
    percentage: parseFloat(((weight / total) * 100).toFixed(2)),
  }));
}

export function getLocalMimicAllocation(investorId: string): MimicResult | null {
  const config = INVESTOR_ALLOCATIONS[investorId];
  if (!config) {
    logger.warn('Unknown investor for local mimic', { investorId });
    return null;
  }

  const holdings = normalizeWeights(config.holdings);
  logger.info('Local mimic allocation built', { investorId, holdingsCount: holdings.length });

  return {
    holdings,
    investorName: config.name,
  };
}

export async function fetchMimicPrices(holdings: MimicHolding[], telegramId?: number): Promise<Map<string, number | null>> {
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

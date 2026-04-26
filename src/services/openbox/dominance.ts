/**
 * Sector dominance check.
 * Is this ticker a top-3 market-cap leader in its sector?
 */

// Hardcoded sector leaders (market cap leaders as of ~2026)
const SECTOR_LEADERS: Record<string, string[]> = {
  'technology': ['AAPL', 'MSFT', 'NVDA'],
  'software': ['MSFT', 'ORCL', 'CRM'],
  'semiconductors': ['NVDA', 'TSM', 'AVGO'],
  'healthcare': ['LLY', 'JNJ', 'UNH'],
  'pharmaceuticals': ['LLY', 'JNJ', 'MRK'],
  'finance': ['BRK-B', 'JPM', 'V'],
  'banks': ['JPM', 'BAC', 'WFC'],
  'energy': ['XOM', 'CVX', 'COP'],
  'oil & gas': ['XOM', 'CVX', 'COP'],
  'consumer': ['AMZN', 'WMT', 'PG'],
  'consumer cyclical': ['AMZN', 'TSLA', 'HD'],
  'consumer defensive': ['WMT', 'PG', 'KO'],
  'industrials': ['GE', 'RTX', 'HON'],
  'utilities': ['NEE', 'SO', 'DUK'],
  'real estate': ['AMT', 'PLD', 'CCI'],
  'materials': ['LIN', 'BHP', 'RIO'],
  'communication services': ['GOOGL', 'META', 'DIS'],
  'telecom': ['VZ', 'T', 'TMUS'],
  'entertainment': ['META', 'NFLX', 'DIS'],
  'automotive': ['TSLA', 'TM', 'BYD'],
};

export interface DominanceResult {
  dominanceBonus: 0 | 3;
  isTop3: boolean;
  sector?: string;
}

export function checkDominance(ticker: string, sector?: string): DominanceResult {
  const upperTicker = ticker.toUpperCase();
  const lookupKey = (sector || '').toLowerCase().trim();

  if (!lookupKey) {
    return { dominanceBonus: 0, isTop3: false };
  }

  const leaders = SECTOR_LEADERS[lookupKey];
  if (!leaders) {
    return { dominanceBonus: 0, isTop3: false, sector: lookupKey };
  }

  const isTop3 = leaders.includes(upperTicker);
  return {
    dominanceBonus: isTop3 ? 3 : 0,
    isTop3,
    sector: lookupKey,
  };
}

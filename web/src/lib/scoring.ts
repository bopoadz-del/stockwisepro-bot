/**
 * Shared frontend scoring utilities mirroring the bot's OpenBox engine.
 * Used by components that need local/fallback scoring when the backend
 * OpenBox score is unavailable.
 */

export function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

export function calculateRSI(prices: number[]): number | undefined {
  if (prices.length < 15) return undefined;
  const closes = prices.slice(-15);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < 15; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

export function computeSMA(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate a momentum score that incorporates intraday change, RSI, and
 * 50/200-day SMA trend — matching the bot's market dynamics pillar.
 */
export function calculateMomentumScore(
  changePercentage: number,
  historicalPrices?: number[]
): number {
  // Base momentum from daily change (-5 to +5 points)
  let score = 50;
  if (changePercentage > 5) score += 5;
  else if (changePercentage > 0) score += 2.5;
  else if (changePercentage < -5) score -= 5;
  else if (changePercentage < 0) score -= 2.5;

  if (!historicalPrices || historicalPrices.length < 15) {
    return clamp(score, 0, 100);
  }

  // RSI component (15% weight of momentum pillar)
  const rsi = calculateRSI(historicalPrices);
  if (rsi !== undefined) {
    const rsiScore = clamp((rsi - 30) / 40 * 100, 0, 100) * 0.15;
    // Blend: base momentum is 0-10 adjustment around 50; rsiScore is 0-15
    score = score * 0.7 + (50 + (rsiScore - 7.5)) * 0.3;
  }

  // SMA trend component (+10 each for price above 50/200 SMA)
  const sma50 = computeSMA(historicalPrices, 50);
  const sma200 = computeSMA(historicalPrices, 200);
  const latest = historicalPrices[historicalPrices.length - 1];
  const trendBonus =
    (latest > (sma50 ?? Infinity) ? 10 : 0) +
    (latest > (sma200 ?? Infinity) ? 10 : 0);
  score = score + trendBonus * 0.2;

  return clamp(score, 0, 100);
}

/**
 * Sector classification helpers.
 * Communication/Telecom stocks are NOT treated as tech-innovation stocks.
 */
export function isTechSector(sector?: string | null, industry?: string | null): boolean {
  const haystack = `${sector || ''} ${industry || ''}`.toLowerCase();
  return [
    'technology',
    'software',
    'semiconductors',
    'biotechnology',
    'healthcare technology',
    'internet content',
    'computer software',
    'application software',
    'advertising',
    'media',
  ].some((s) => haystack.includes(s));
}

export function isCommSector(sector?: string | null, industry?: string | null): boolean {
  const haystack = `${sector || ''} ${industry || ''}`.toLowerCase();
  return ['communication', 'telecom', 'wireless', 'telecommunications'].some((s) =>
    haystack.includes(s)
  );
}

/**
 * Max drawdown with correct peak/trough reporting.
 */
export function calculateMaxDrawdown(prices: number[]): {
  maxDrawdown: number;
  peak: number;
  trough: number;
} {
  let runningPeak = prices[0];
  let runningTrough = prices[0];
  let maxDD = 0;
  let maxPeak = prices[0];
  let maxTrough = prices[0];

  for (const price of prices) {
    if (price > runningPeak) {
      runningPeak = price;
      runningTrough = price;
    } else if (price < runningTrough) {
      runningTrough = price;
      const dd = (runningPeak - runningTrough) / runningPeak;
      if (dd > maxDD) {
        maxDD = dd;
        maxPeak = runningPeak;
        maxTrough = runningTrough;
      }
    }
  }

  return { maxDrawdown: maxDD, peak: maxPeak, trough: maxTrough };
}

import YahooFinance from 'yahoo-finance2';
import { getHistoricalPrices } from '../api/yahoo';
import { databento } from '../api/databento';
import { logger } from '../utils/logger';
import { setQuote, setFundamentals, getQuote, getFundamentals } from './cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface StockMetrics {
  price: number;
  pe_ratio?: number;
  pb_ratio?: number;
  roe?: number;
  margin?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  rsi?: number;
  price_change_6m?: number;
}

export interface ScoreResult {
  score: number;
  price: number;
  metrics: StockMetrics;
  breakdown: Record<string, number>;
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

function toNum(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function scorePe(pe: number): number {
  if (!Number.isFinite(pe) || pe <= 0) return 0;
  return clamp(100 - (pe - 10) / 30 * 100, 0, 100);
}

function scorePb(pb: number): number {
  if (!Number.isFinite(pb) || pb <= 0) return 50;
  return clamp(100 - (pb - 1) / 4 * 100, 0, 100);
}

function scoreRoe(roe: number): number {
  if (!Number.isFinite(roe)) return 50;
  return clamp(roe / 0.25 * 100, 0, 100);
}

function scoreMargin(margin: number): number {
  if (!Number.isFinite(margin)) return 50;
  return clamp(margin / 0.20 * 100, 0, 100);
}

function scoreGrowth(growth: number): number {
  if (!Number.isFinite(growth)) return 50;
  return clamp((growth + 0.2) / 0.5 * 100, 0, 100);
}

function scoreDebtToEquity(de: number): number {
  if (!Number.isFinite(de)) return 50;
  return clamp(100 - (de - 30) / 120 * 100, 0, 100);
}

function scoreCurrentRatio(cr: number): number {
  if (!Number.isFinite(cr)) return 50;
  return clamp((cr - 0.5) / 1.5 * 100, 0, 100);
}

function scoreMomentum(change6m: number): number {
  if (!Number.isFinite(change6m)) return 50;
  return clamp((change6m + 30) / 60 * 100, 0, 100);
}

function calculateRSI(prices: number[]): number | undefined {
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

export async function computeLocalScore(ticker: string): Promise<ScoreResult | null> {
  const upperTicker = ticker.toUpperCase();

  try {
    // 1. Try cache first
    const cachedQuote = await getQuote(upperTicker);
    const cachedFundamentals = await getFundamentals(upperTicker);

    let price = cachedQuote?.price ?? 0;
    let pe = cachedFundamentals?.pe;
    let pb = cachedFundamentals?.pb;
    let roe = cachedFundamentals?.roe;
    let margin = cachedFundamentals?.margin;
    let revenueGrowth = cachedFundamentals?.revenueGrowth;
    let earningsGrowth = cachedFundamentals?.earningsGrowth;
    let debtToEquity = cachedFundamentals?.debtToEquity;
    let currentRatio = cachedFundamentals?.currentRatio;
    let rsi = cachedFundamentals?.rsi;
    let priceChange6m = cachedFundamentals?.priceChange6m;

    const hasFundamentals = pe !== undefined || pb !== undefined || margin !== undefined;

    // 2a. Try Databento for live price (if enabled and no cached price)
    if (price === 0 && databento.enabled) {
      const dbTrade = await databento.getLatestTrade(upperTicker);
      if (dbTrade && dbTrade.price > 0) {
        price = dbTrade.price;
        await setQuote({ ticker: upperTicker, price, timestamp: Date.now() });
        logger.info('Databento price used', { ticker: upperTicker, price });
      }
    }

    // 2b. Cache miss on fundamentals → fetch from Yahoo Finance
    if (!hasFundamentals) {
      const summary = await yf.quoteSummary(upperTicker, {
        modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'],
      });

      price = toNum(summary.financialData?.currentPrice ?? summary.summaryDetail?.previousClose) ?? price;
      pe = pe ?? toNum(summary.summaryDetail?.trailingPE);
      pb = pb ?? toNum(summary.defaultKeyStatistics?.priceToBook);
      roe = roe ?? toNum(summary.defaultKeyStatistics?.returnOnEquity);
      margin = margin ?? toNum(summary.financialData?.profitMargins);
      revenueGrowth = revenueGrowth ?? toNum(summary.financialData?.revenueGrowth);
      earningsGrowth = earningsGrowth ?? toNum(summary.financialData?.earningsGrowth);
      debtToEquity = debtToEquity ?? toNum(summary.financialData?.debtToEquity);
      currentRatio = currentRatio ?? toNum(summary.financialData?.currentRatio);

      // Write quote to cache
      if (price > 0) {
        await setQuote({ ticker: upperTicker, price, timestamp: Date.now() });
      }
    }

    // 3. Fetch historical prices for momentum & RSI (if not cached)
    if (rsi === undefined || priceChange6m === undefined) {
      const hist = await getHistoricalPrices(ticker, '1y');
      if (hist.data && hist.data.length >= 130) {
        const prices = hist.data.map(d => d.close);
        rsi = calculateRSI(prices);
        const sixMonthsAgo = prices[prices.length - 130];
        const latest = prices[prices.length - 1];
        priceChange6m = ((latest - sixMonthsAgo) / sixMonthsAgo) * 100;
      }
    }

    // 4. Write fundamentals to cache
    await setFundamentals(upperTicker, {
      ticker: upperTicker,
      pe, pb, roe, margin,
      revenueGrowth, earningsGrowth,
      debtToEquity, currentRatio,
      rsi, priceChange6m,
    });

    const metrics: StockMetrics = {
      price: Number.isFinite(price) ? price : 0,
      pe_ratio: pe,
      pb_ratio: pb,
      roe,
      margin,
      revenue_growth: revenueGrowth,
      earnings_growth: earningsGrowth,
      debt_to_equity: debtToEquity,
      current_ratio: currentRatio,
      rsi,
      price_change_6m: priceChange6m,
    };

    // Compute category scores
    const valuationScores: number[] = [];
    if (pe !== undefined) valuationScores.push(scorePe(pe));
    if (pb !== undefined) valuationScores.push(scorePb(pb));

    const profitabilityScores: number[] = [];
    if (roe !== undefined) profitabilityScores.push(scoreRoe(roe));
    if (margin !== undefined) profitabilityScores.push(scoreMargin(margin));

    const growthScores: number[] = [];
    if (revenueGrowth !== undefined) growthScores.push(scoreGrowth(revenueGrowth));
    if (earningsGrowth !== undefined) growthScores.push(scoreGrowth(earningsGrowth));

    const healthScores: number[] = [];
    if (debtToEquity !== undefined) healthScores.push(scoreDebtToEquity(debtToEquity));
    if (currentRatio !== undefined) healthScores.push(scoreCurrentRatio(currentRatio));

    const momentumScores: number[] = [];
    if (priceChange6m !== undefined) momentumScores.push(scoreMomentum(priceChange6m));
    if (rsi !== undefined) momentumScores.push(clamp((rsi - 30) / 40 * 100, 0, 100)); // RSI 30=0, 70=100

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const breakdown = {
      valuation: valuationScores.length ? avg(valuationScores) : 50,
      profitability: profitabilityScores.length ? avg(profitabilityScores) : 50,
      growth: growthScores.length ? avg(growthScores) : 50,
      financial_health: healthScores.length ? avg(healthScores) : 50,
      momentum: momentumScores.length ? avg(momentumScores) : 50,
    };

    const overall = Math.round(
      (breakdown.valuation + breakdown.profitability + breakdown.growth + breakdown.financial_health + breakdown.momentum) / 5
    );

    return {
      score: overall,
      price: metrics.price,
      metrics,
      breakdown,
    };
  } catch (err) {
    logger.error('Local scoring failed', { ticker, error: (err as Error).message });
    return null;
  }
}

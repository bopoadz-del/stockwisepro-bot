import YahooFinance from 'yahoo-finance2';
import { getHistoricalPrices } from '../../api/yahoo';
import { logger } from '../../utils/logger';
import { computeLocalScore } from '../scoring';
import { FundamentalsComposite } from '../fundamentals';
import { checkEthics } from './ethics';
import { computePeerDelta } from './peers';
import { checkDominance } from './dominance';
import { analyzeRisks } from './risks';
import { generateNarrative } from './narrative';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeVolatilityScore(prices: number[]): number {
  if (prices.length < 2) return 50;
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const annualizedVol = stdDev * Math.sqrt(252);
  return clamp(100 - (annualizedVol / 0.5) * 100, 0, 100);
}

function computeRelativeStrength(tickerPrices: number[], spyPrices: number[]): number {
  if (tickerPrices.length < 2 || spyPrices.length < 2) return 50;
  const tickerReturn = (tickerPrices[tickerPrices.length - 1] - tickerPrices[0]) / tickerPrices[0];
  const spyReturn = (spyPrices[spyPrices.length - 1] - spyPrices[0]) / spyPrices[0];
  const delta = tickerReturn - spyReturn;
  // +20% outperformance = 100, -20% underperformance = 0
  return clamp((delta + 0.2) / 0.4 * 100, 0, 100);
}

export interface OpenBoxScore {
  finalScore: number;
  pillars: {
    fundamentals: number;
    marketDynamics: number;
    balanceSheet: number;
    leadership: number;
    innovation: number;
    ethics: number;
  };
  riskFlags: string[];
  narrative: string;
  ethicsPass: boolean;
  adjustments: {
    peerDelta: number;
    dominanceBonus: number;
  };
}

export async function computeOpenBoxScore(ticker: string): Promise<OpenBoxScore | null> {
  const upperTicker = ticker.toUpperCase();

  try {
    // ── 1. Fetch data in parallel ──────────────────────────────────────────
    const [localScore, fullSummary, hist, spyHist] = await Promise.all([
      computeLocalScore(upperTicker),
      yf.quoteSummary(upperTicker, {
        modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'incomeStatementHistory', 'summaryProfile'],
      }).catch(() => null),
      getHistoricalPrices(upperTicker, '1y'),
      getHistoricalPrices('SPY', '1y').catch(() => ({ data: [], error: 'SPY fetch failed' })),
    ]);

    if (!localScore) {
      logger.error('OpenBox engine: localScore failed', { ticker: upperTicker });
      return null;
    }

    const fd = fullSummary?.financialData;
    const dks = fullSummary?.defaultKeyStatistics;
    const sd = fullSummary?.summaryDetail;
    const inc = fullSummary?.incomeStatementHistory?.incomeStatementHistory;
    const profile = fullSummary?.summaryProfile;

    const price = toNum(fd?.currentPrice ?? sd?.previousClose);
    const marketCap = price * toNum(dks?.sharesOutstanding);
    const sector = (profile?.sector || '').toLowerCase();
    const industry = (profile?.industry || '').toLowerCase();
    const name = (profile?.longBusinessSummary || profile?.name || upperTicker).slice(0, 100);

    // ── 2. Ethics (10 pts, hard gate) ──────────────────────────────────────
    const ethicsResult = checkEthics(upperTicker, sector, industry, name);
    const ethicsScore = ethicsResult.pass ? 10 : 0;

    if (!ethicsResult.pass) {
      return {
        finalScore: 0,
        pillars: {
          fundamentals: 0,
          marketDynamics: 0,
          balanceSheet: 0,
          leadership: 0,
          innovation: 0,
          ethics: 0,
        },
        riskFlags: ethicsResult.violations,
        narrative: 'Blocked by ethics filter — avoid.',
        ethicsPass: false,
        adjustments: { peerDelta: 0, dominanceBonus: 0 },
      };
    }

    // ── 3. Fundamentals (30 or 35) ─────────────────────────────────────────
    const breakdown = localScore.breakdown;
    const valuation = breakdown.valuation ?? 50;
    const profitability = breakdown.profitability ?? 50;
    const growth = breakdown.growth ?? 50;

    const roa = toNum(dks?.returnOnAssets);
    const roaScore = clamp(roa / 0.25 * 100, 0, 100);

    const fcf = toNum(fd?.freeCashflow);
    const fcfYield = marketCap > 0 ? fcf / marketCap : 0;
    const fcfScore = clamp((fcfYield + 0.02) / 0.07 * 100, 0, 100);

    let fundamentalsScore = (valuation + profitability + growth + roaScore + fcfScore) / 5;

    // Piotroski cap boost
    const piotroRaw = localScore.fundamentals?.piotroski_f.raw ?? 0;
    if (piotroRaw >= 7) {
      fundamentalsScore = Math.min(fundamentalsScore + 5, 100);
    }

    // ── 4. Market Dynamics (15 or 18.75) ───────────────────────────────────
    const momentum = breakdown.momentum ?? 50;

    const histPrices = hist.data?.map(d => d.close) || [];
    const volScore = computeVolatilityScore(histPrices);

    const spyPrices = spyHist.data?.map((d: any) => d.close) || [];
    const relStrengthScore = computeRelativeStrength(histPrices, spyPrices);

    const marketDynamicsScore = (momentum + volScore + relStrengthScore) / 3;

    // ── 5. Balance Sheet (15 or 18.75) ─────────────────────────────────────
    const de = breakdown.financial_health ?? 50; // already scored in scoring.ts
    const healthRaw = localScore.metrics.debt_to_equity ?? 0;
    const currentRatio = localScore.metrics.current_ratio ?? 0;
    const currentRatioScore = clamp((currentRatio - 0.5) / 1.5 * 100, 0, 100);

    const ebit = toNum(inc?.[0]?.ebit);
    const totalDebt = toNum(fd?.totalDebt);
    const interestCoverage = totalDebt > 0 ? ebit / totalDebt : 0;
    const icScore = clamp((interestCoverage - 1) / 4 * 100, 0, 100);

    const totalCash = toNum(fd?.totalCash);
    const cashReservesRatio = totalDebt > 0 ? totalCash / totalDebt : 0;
    const cashScore = cashReservesRatio >= 1 ? 100 : clamp(cashReservesRatio * 100, 0, 100);

    let balanceSheetScore = (de + currentRatioScore + icScore + cashScore) / 4;

    // Altman Z cap boost
    const altmanRaw = localScore.fundamentals?.altman_z.raw ?? 0;
    if (altmanRaw > 3) {
      balanceSheetScore = Math.min(balanceSheetScore + 5, 100);
    }

    // ── 6. Leadership (15 or 17.5) ─────────────────────────────────────────
    let leadershipScore = 50;
    // shares outstanding decreasing (proxy: compare current vs previous year if available)
    const sharesNow = toNum(dks?.sharesOutstanding);
    const sharesPrev = toNum(dks?.sharesShortPriorMonth); // rough proxy, often not available
    if (sharesNow > 0 && sharesPrev > 0 && sharesNow < sharesPrev) {
      leadershipScore += 5;
    }
    // dividend yield > 0
    const divYield = toNum(sd?.dividendYield);
    if (divYield > 0) {
      leadershipScore += 5;
    }
    // target mean price within 10% of current
    const targetMean = toNum(fd?.targetMeanPrice);
    if (targetMean > 0 && price > 0 && Math.abs(targetMean - price) / price <= 0.1) {
      leadershipScore += 5;
    }

    // ── 7. Innovation (15 or 0 redistributed) ───────────────────────────────
    const techSectors = new Set(['technology', 'software', 'semiconductors', 'biotechnology', 'healthcare technology']);
    const isTech = techSectors.has(sector) || techSectors.has(industry);

    let innovationScore = 0;
    if (isTech) {
      const rd = toNum(inc?.[0]?.researchDevelopment);
      const revenue = toNum(inc?.[0]?.totalRevenue);
      const rdRatio = revenue > 0 ? rd / revenue : 0;
      innovationScore = clamp(rdRatio / 0.2 * 100, 0, 100);
    }

    // ── 8. Apply weights ────────────────────────────────────────────────────
    let weights = {
      fundamentals: 30,
      marketDynamics: 15,
      balanceSheet: 15,
      leadership: 15,
      innovation: 15,
      ethics: 10,
    };

    if (!isTech) {
      // Redistribute innovation 15 pts
      weights = {
        fundamentals: 35,
        marketDynamics: 18.75,
        balanceSheet: 18.75,
        leadership: 17.5,
        innovation: 0,
        ethics: 10,
      };
    }

    const weightedFundamentals = (fundamentalsScore / 100) * weights.fundamentals;
    const weightedMarket = (marketDynamicsScore / 100) * weights.marketDynamics;
    const weightedBalance = (balanceSheetScore / 100) * weights.balanceSheet;
    const weightedLeadership = (leadershipScore / 100) * weights.leadership;
    const weightedInnovation = (innovationScore / 100) * weights.innovation;
    const weightedEthics = ethicsScore; // already 0-10

    let subtotal = weightedFundamentals + weightedMarket + weightedBalance + weightedLeadership + weightedInnovation + weightedEthics;

    // ── 9. Adjustments ──────────────────────────────────────────────────────
    const pe = toNum(sd?.trailingPE);
    const peer = computePeerDelta(pe, sector, industry);
    const dom = checkDominance(upperTicker, sector);

    subtotal += peer.peerDelta + dom.dominanceBonus;

    const finalScore = clamp(Math.round(subtotal), 0, 100);

    // ── 10. Risk flags & narrative ─────────────────────────────────────────
    const riskResult = analyzeRisks({
      operatingCashflow: toNum(fd?.operatingCashflow),
      debtToEquity: toNum(localScore.metrics.debt_to_equity),
      margin: toNum(localScore.metrics.margin),
      currentRatio: toNum(localScore.metrics.current_ratio),
      altmanZRaw: localScore.fundamentals?.altman_z.raw ?? undefined,
      piotroskiRaw: localScore.fundamentals?.piotroski_f.raw ?? undefined,
    });

    const narrative = generateNarrative(fundamentalsScore, marketDynamicsScore, balanceSheetScore);

    return {
      finalScore,
      pillars: {
        fundamentals: Math.round(fundamentalsScore),
        marketDynamics: Math.round(marketDynamicsScore),
        balanceSheet: Math.round(balanceSheetScore),
        leadership: Math.round(leadershipScore),
        innovation: Math.round(innovationScore),
        ethics: ethicsScore,
      },
      riskFlags: riskResult.flags,
      narrative: narrative.sentence,
      ethicsPass: true,
      adjustments: {
        peerDelta: peer.peerDelta,
        dominanceBonus: dom.dominanceBonus,
      },
    };

  } catch (err) {
    logger.error('OpenBox engine failed', { ticker: upperTicker, error: (err as Error).message });
    return null;
  }
}

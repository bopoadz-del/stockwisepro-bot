import YahooFinance from 'yahoo-finance2';
import { getHistoricalPrices } from '../../api/yahoo';
import { fmp, FMPKeyMetrics, FMPRating, FMPIncomeStatement, FMPBalanceSheet } from '../../api/fmp';
import { logger } from '../../utils/logger';
import { checkEthics } from './ethics';
import { computePeerDelta } from './peers';
import { checkDominance } from './dominance';
import { getUserWeights } from '../../db';
import { ScoreRule } from '../../types';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

// Round to one decimal for display of point contributions.
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Format a ratio as a percentage string for the breakdown's "detail" column.
function asPct(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return 'n/a';
  return (x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0) + '%';
}

// Format a large count (e.g. average volume) compactly.
function asCompact(x: number | undefined): string {
  if (!x || !Number.isFinite(x)) return 'n/a';
  if (x >= 1e9) return (x / 1e9).toFixed(1) + 'B';
  if (x >= 1e6) return (x / 1e6).toFixed(1) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'K';
  return String(Math.round(x));
}

/**
 * Rank the scoring rules by how much each one helped or hurt relative to its own
 * ceiling. A rule centred above its mid-point is a "booster"; below is a "drag".
 * Adjustments (max === 0) count by signed points. Deterministic — no LLM.
 */
export function getScoreDrivers(
  breakdown: ScoreRule[] | undefined,
  limit = 3
): { boosters: string[]; drags: string[] } {
  if (!breakdown || breakdown.length === 0) return { boosters: [], drags: [] };
  const scored = breakdown.map((r) => ({
    label: r.metric,
    // centre each rule around its mid-point; adjustments use raw signed points
    centered: r.max > 0 ? r.points - r.max / 2 : r.points,
  }));
  const boosters = scored
    .filter((s) => s.centered > 0.5)
    .sort((a, b) => b.centered - a.centered)
    .slice(0, limit)
    .map((s) => s.label);
  const drags = scored
    .filter((s) => s.centered < -0.5)
    .sort((a, b) => a.centered - b.centered)
    .slice(0, limit)
    .map((s) => s.label);
  return { boosters, drags };
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

function computeSMA(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

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

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumOpt(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeDivide(a: number, b: number): number {
  return b !== 0 ? a / b : 0;
}

function mapConsensusRating(rating?: FMPRating | null): 'buy' | 'hold' | 'sell' | undefined {
  if (!rating) return undefined;
  const rec = (rating.ratingRecommendation || rating.rating || '').toLowerCase();
  if (rec.includes('buy')) return 'buy';
  if (rec.includes('sell')) return 'sell';
  if (rec.includes('hold') || rec.includes('neutral')) return 'hold';
  return undefined;
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
  breakdown?: ScoreRule[];
  isETF?: boolean;
  sector?: string;
  industry?: string;
}

// ── Piotroski F-Score (9-point quality check) ────────────────────────────────
function computePiotroski(
  currInc: any,
  prevInc: any,
  currBs: any,
  prevBs: any,
  cashflow: any,
  price: number,
  shares: number
): number {
  let score = 0;
  if (!currInc || !prevInc || !currBs || !prevBs) return 0;

  const currROA = safeDivide(currInc.netIncome, currBs.totalAssets);
  const prevROA = safeDivide(prevInc.netIncome, prevBs.totalAssets);
  if (currROA > 0) score++;
  if (currROA > prevROA) score++;

  const currCf = cashflow?.totalCashFromOperatingActivities ?? cashflow?.operatingCashflow ?? 0;
  if (currCf > 0) score++;

  if (currCf > currInc.netIncome) score++;

  const currLeverage = safeDivide(currBs.totalLiab, currBs.totalAssets);
  const prevLeverage = safeDivide(prevBs.totalLiab, prevBs.totalAssets);
  if (currLeverage < prevLeverage) score++;

  const currRatio = safeDivide(currBs.totalCurrentAssets, currBs.totalCurrentLiabilities);
  const prevRatio = safeDivide(prevBs.totalCurrentAssets, prevBs.totalCurrentLiabilities);
  if (currRatio > prevRatio) score++;

  const currShares = toNum(currBs.commonStockSharesOutstanding);
  const prevShares = toNum(prevBs.commonStockSharesOutstanding);
  if (currShares === 0 || prevShares === 0 || currShares <= prevShares) score++;

  const currMargin = safeDivide(currInc.operatingIncome, currInc.totalRevenue);
  const prevMargin = safeDivide(prevInc.operatingIncome, prevInc.totalRevenue);
  if (currMargin > prevMargin) score++;

  const currTurnover = safeDivide(currInc.totalRevenue, currBs.totalAssets);
  const prevTurnover = safeDivide(prevInc.totalRevenue, prevBs.totalAssets);
  if (currTurnover > prevTurnover) score++;

  return score;
}

// ── Altman Z-Score ───────────────────────────────────────────────────────────
function computeAltmanZ(metrics: any): number {
  const wc = (metrics.currentAssets ?? 0) - (metrics.currentLiabilities ?? 0);
  const ta = metrics.totalAssets ?? 0;
  const re = metrics.retainedEarnings ?? 0;
  const ebit = metrics.operatingIncome ?? 0;
  const mc = metrics.marketCap ?? 0;
  const tl = metrics.totalLiabilities ?? 0;
  const rev = metrics.revenue ?? 0;

  if (ta === 0 || tl === 0) return 0;

  const A = safeDivide(wc, ta);
  const B = safeDivide(re, ta);
  const C = safeDivide(ebit, ta);
  const D = safeDivide(mc, tl);
  const E = safeDivide(rev, ta);

  return 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
}

// ── Risk flag generator ──────────────────────────────────────────────────────
function generateRiskFlags(
  m: any,
  isETF: boolean,
  sector: string,
  industry: string,
  name: string,
  priceChange6m?: number,
  priceChangeYtd?: number
): string[] {
  const flags: string[] = [];

  if (isETF) {
    if (!m.dividendYield || m.dividendYield === 0) {
      flags.push('No income generation (zero dividend)');
    }
    const category = (m.fundCategory || '').toLowerCase();
    if (category.includes('commodities') || category.includes('gold') || name.toLowerCase().includes('gold')) {
      flags.push('Single commodity concentration');
      flags.push('Custody risk (physical vaults)');
      flags.push('Commodity volatility inherent');
    }
    return flags;
  }

  // Stock-specific flags
  const pe = m.trailingPE ?? 0;
  const pb = m.priceToBook ?? 0;
  const de = m.debtToEquity ?? 0;
  const margin = m.profitMargin ?? 0;
  const currRatio = m.currentRatio ?? 0;
  const ocf = m.operatingCashflow ?? 0;
  const piotroski = m.piotroskiRaw ?? 0;
  const altmanZ = m.altmanZRaw ?? 0;

  if (pe > 40 || pb > 20) {
    flags.push('Extreme valuation');
  }
  if (de > 150) {
    flags.push('High leverage');
  }
  if (priceChange6m !== undefined && priceChange6m < -0.20) {
    flags.push('Terrible momentum');
  }
  if (priceChangeYtd !== undefined && priceChangeYtd < -0.30) {
    flags.push('Severe drawdown');
  }
  if (ocf < 0) {
    flags.push('Weak cash flow');
  }
  if (margin > 0 && margin < 0.05) {
    flags.push('Declining margins');
  }
  if (currRatio > 0 && currRatio < 1) {
    flags.push('Low liquidity');
  }
  if (altmanZ > 0 && altmanZ < 1.8) {
    flags.push('Distress zone');
  }
  if (piotroski > 0 && piotroski < 4) {
    flags.push('Low quality');
  }
  if (industry.includes('advertising') || industry.includes('marketing') || name.toLowerCase().includes('ad ')) {
    flags.push('Regulatory risk (data collection practices)');
  }
  if ((sector.includes('technology') || industry.includes('software')) && pe > 30 && (priceChange6m ?? 0) < -0.15) {
    flags.push('AI disruption fears');
  }

  return flags;
}

// ── Narrative generator ──────────────────────────────────────────────────────
function generateNarrative(
  fundamentalsRaw: number,
  marketRaw: number,
  balanceRaw: number,
  isETF: boolean,
  sector: string,
  industry: string,
  name: string,
  riskFlags: string[],
  finalScore: number,
  priceChange6m?: number,
  priceChangeYtd?: number
): string {
  const fWord = fundamentalsRaw >= 70 ? 'Strong' : fundamentalsRaw < 50 ? 'Weak' : 'Moderate';
  const mWord = marketRaw >= 70 ? 'strong' : marketRaw < 50 ? 'weak' : 'moderate';
  const bWord = balanceRaw >= 70 ? 'safe' : balanceRaw < 50 ? 'stressed' : 'mixed';

  let action: string;
  if (finalScore >= 85) action = 'aggressive buy';
  else if (finalScore >= 70) action = 'core holding';
  else if (finalScore >= 55) action = 'tactical / watch';
  else action = 'avoid / exit';

  // Contextual additions
  if (isETF) {
    const category = name.toLowerCase().includes('gold') ? 'gold' : 'commodity';
    if (finalScore >= 70) {
      return `${fWord} fundamentals for an ETF wrapper, ${mWord} momentum riding ${category} bull run, ${bWord} custody structure — accumulation on dips as inflation hedge.`;
    }
    return `${fWord} fundamentals for an ETF wrapper, ${mWord} momentum, ${bWord} custody structure — ${action}.`;
  }

  // Tech stocks with strong fundamentals but weak momentum
  if ((sector.includes('technology') || industry.includes('software')) && fundamentalsRaw >= 70 && marketRaw < 50) {
    return `Exceptional fundamentals and execution, but market is pricing in existential risk — high conviction core holding only if you believe the moat survives scrutiny.`;
  }

  // High valuation + poor momentum
  if (fundamentalsRaw >= 60 && marketRaw < 40) {
    return `${fWord} fundamentals and execution, but ${mWord} momentum suggests the market is re-rating the story — ${action}.`;
  }

  return `${fWord} fundamentals, ${mWord} momentum, ${bWord} balance sheet — ${action}.`;
}

// ── Main engine ──────────────────────────────────────────────────────────────
export async function computeOpenBoxScore(ticker: string, telegramId?: number): Promise<OpenBoxScore | null> {
  const upper = ticker.toUpperCase();

  try {
    const [fullSummary, hist, spyHist, fmpMetrics, fmpRatings, fmpIncome, fmpBalance] = await Promise.all([
      fetchQuoteSummary(upper, [
        'financialData',
        'defaultKeyStatistics',
        'summaryDetail',
        'summaryProfile',
        'incomeStatementHistory',
        'balanceSheetHistory',
        'price',
        'fundProfile',
      ]).catch(() => null),
      getHistoricalPrices(upper, '1y'),
      getHistoricalPrices('SPY', '1y').catch(() => ({ data: [], error: 'SPY fetch failed' })),
      fmp.getKeyMetrics(upper).catch(() => null),
      fmp.getRatings(upper).catch(() => null),
      fmp.getIncomeStatements(upper, 3).catch(() => []),
      fmp.getBalanceSheets(upper, 3).catch(() => []),
    ]);

    if (!fullSummary) {
      logger.error('OpenBox engine: quoteSummary failed', { ticker: upper });
      return null;
    }

    const fd = fullSummary.financialData;
    const dks = fullSummary.defaultKeyStatistics;
    const sd = fullSummary.summaryDetail;
    const profile = fullSummary.summaryProfile;
    const inc = fullSummary.incomeStatementHistory?.incomeStatementHistory as any[] | undefined;
    const bs = fullSummary.balanceSheetHistory?.balanceSheetHistory as any[] | undefined;

    // FMP fallback for multi-year statements needed by Piotroski F-Score
    const fmpInc = (fmpIncome?.length || 0) >= 2
      ? fmpIncome!.map((s) => ({
          endDate: { fmt: s.date },
          totalRevenue: s.revenue,
          operatingIncome: s.operatingIncome,
          netIncome: s.netIncome,
          researchDevelopment: s.researchAndDevelopmentExpenses,
        }))
      : undefined;
    const fmpBs = (fmpBalance?.length || 0) >= 2
      ? fmpBalance!.map((s) => ({
          endDate: { fmt: s.date },
          totalAssets: s.totalAssets,
          totalLiab: s.totalLiabilities,
          totalCurrentAssets: s.totalCurrentAssets,
          totalCurrentLiabilities: s.totalCurrentLiabilities,
          retainedEarnings: s.retainedEarnings,
          commonStockSharesOutstanding: s.commonStock,
        }))
      : undefined;

    const effectiveInc = inc?.length && inc.length >= 2 ? inc : fmpInc;
    const effectiveBs = bs?.length && bs.length >= 2 ? bs : fmpBs;
    const priceMod = fullSummary.price;
    const fundProf = fullSummary.fundProfile;
    const fundPerf = fullSummary.fundPerformance;

    // FMP fallback helpers: use FMP data when Yahoo returns undefined/0
    const fmpNum = (k: keyof FMPKeyMetrics): number | undefined => {
      const v = fmpMetrics?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      return undefined;
    };

    const price = toNum(priceMod?.regularMarketPrice ?? sd?.previousClose);
    const marketCap = toNum(sd?.marketCap ?? price * toNum(dks?.sharesOutstanding));
    const sectorRaw = profile?.sector || '';
    const industryRaw = profile?.industry || '';
    const sector = sectorRaw.toLowerCase();
    const industry = industryRaw.toLowerCase();
    const name = (profile?.longBusinessSummary || profile?.name || upper).slice(0, 100);

    const isETF =
      priceMod?.quoteType === 'ETF' ||
      fundProf?.legalType === 'Exchange Traded Fund' ||
      name.toLowerCase().includes('etf') ||
      !!dks?.fundFamily;

    // Ethics hard gate
    const ethicsResult = checkEthics(upper, sector, industry, name);
    if (!ethicsResult.pass) {
      return {
        finalScore: 0,
        pillars: { fundamentals: 0, marketDynamics: 0, balanceSheet: 0, leadership: 0, innovation: 0, ethics: 0 },
        riskFlags: ethicsResult.violations,
        narrative: 'Blocked by ethics filter — avoid.',
        ethicsPass: false,
        adjustments: { peerDelta: 0, dominanceBonus: 0 },
        isETF,
      };
    }

    // Historical price changes
    const prices = hist.data?.map((d: any) => d.close) || [];
    let priceChange6m: number | undefined;
    let priceChangeYtd: number | undefined;
    if (prices.length >= 2) {
      const idx6m = Math.max(0, prices.length - 126);
      priceChange6m = safeDivide(prices[prices.length - 1] - prices[idx6m], prices[idx6m]);
      priceChangeYtd = safeDivide(prices[prices.length - 1] - prices[0], prices[0]);
    }

    // Build metrics object (FMP fills Yahoo gaps)
    const m = {
      price,
      marketCap: marketCap || fmpNum('marketCap') || 0,
      revenueGrowth: toNumOpt(fd?.revenueGrowth) ?? fmpNum('revenueGrowth'),
      earningsGrowth: toNumOpt(fd?.earningsGrowth) ?? fmpNum('netIncomeGrowth'),
      profitMargin: toNumOpt(fd?.profitMargins) ?? fmpNum('netProfitMargin'),
      roe: toNumOpt(fd?.returnOnEquity) ?? fmpNum('returnOnEquity'),
      operatingCashflow: toNumOpt(fd?.operatingCashflow) ?? fmpNum('freeCashFlowPerShare'),
      freeCashflow: toNumOpt(fd?.freeCashflow) ?? fmpNum('freeCashFlowPerShare'),
      totalDebt: toNumOpt(fd?.totalDebt),
      totalCash: toNumOpt(fd?.totalCash),
      currentRatio: toNumOpt(fd?.currentRatio) ?? fmpNum('currentRatio'),
      debtToEquity: toNumOpt(fd?.debtToEquity) ?? fmpNum('debtToEquity'),
      trailingPE: toNumOpt(sd?.trailingPE) ?? fmpNum('peRatio'),
      forwardPE: toNumOpt(dks?.forwardPE),
      priceToBook: toNumOpt(dks?.priceToBook) ?? fmpNum('pbRatio'),
      beta: toNumOpt(dks?.beta),
      avgVolume: toNumOpt(sd?.averageVolume),
      dividendYield: toNumOpt(sd?.dividendYield) ?? fmpNum('dividendYield'),
      sharesOutstanding: toNumOpt(dks?.sharesOutstanding),
      bookValue: toNumOpt(dks?.bookValue),
      ebitda: toNumOpt(fd?.ebitda),
      targetMeanPrice: toNumOpt(fd?.targetMeanPrice),
      fiftyTwoWeekHigh: toNumOpt(sd?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: toNumOpt(sd?.fiftyTwoWeekLow),
      expenseRatio: toNumOpt(fundProf?.feesExpensesInvestment?.annualReportExpenseRatio),
      expenseRatioCategory: toNumOpt(fundProf?.feesExpensesInvestmentCat?.annualReportExpenseRatio),
      fundFamily: fundProf?.family,
      fundCategory: fundProf?.categoryName,
      ytdReturn: toNumOpt(fundPerf?.performanceOverview?.ytdReturnPct),
      oneYearReturn: toNumOpt(fundPerf?.trailingReturns?.oneYear),
      threeYearReturn: toNumOpt(fundPerf?.trailingReturns?.threeYear),
      fiveYearReturn: toNumOpt(fundPerf?.trailingReturns?.fiveYear),
      tenYearReturn: toNumOpt(fundPerf?.trailingReturns?.tenYear),
      fundStdDev: toNumOpt(fundPerf?.riskOverviewStatistics?.riskStatistics?.find((r: any) => r.year === '5y')?.stdDev),
      fundSharpe: toNumOpt(fundPerf?.riskOverviewStatistics?.riskStatistics?.find((r: any) => r.year === '5y')?.sharpeRatio),
      fundBeta: toNumOpt(fundPerf?.riskOverviewStatistics?.riskStatistics?.find((r: any) => r.year === '5y')?.beta),
      revenue: toNumOpt(inc?.[0]?.totalRevenue),
      rdExpense: toNumOpt(inc?.[0]?.researchDevelopment),
      operatingIncome: toNumOpt(inc?.[0]?.operatingIncome),
      totalAssets: toNumOpt(bs?.[0]?.totalAssets),
      totalLiabilities: toNumOpt(bs?.[0]?.totalLiabilities),
      currentAssets: toNumOpt(bs?.[0]?.totalCurrentAssets),
      currentLiabilities: toNumOpt(bs?.[0]?.totalCurrentLiabilities),
      retainedEarnings: toNumOpt(bs?.[0]?.retainedEarnings),
      priceChange6m,
      priceChangeYtd,
    };

    // Compute fundamentals quality scores
    const piotroskiRaw = computePiotroski(
      effectiveInc?.[0], effectiveInc?.[1],
      effectiveBs?.[0], effectiveBs?.[1],
      fd, price, m.sharesOutstanding ?? 0
    );
    const altmanZRaw = computeAltmanZ(m);

    (m as any).piotroskiRaw = piotroskiRaw;
    (m as any).altmanZRaw = altmanZRaw;

    // ── Pillar scoring ──
    let fundamentalsRaw: number;
    let marketRaw: number;
    let balanceRaw: number;
    let leadershipRaw: number;
    let innovationRaw: number;

    // Per-metric rule breakdown: every scoring rule records the points it
    // contributed and its ceiling, so the score is fully explainable.
    const breakdown: ScoreRule[] = [];
    const rule = (pillar: string, metric: string, detail: string, points: number, max: number) =>
      breakdown.push({ pillar, metric, detail, points: r1(points), max });

    if (isETF) {
      // ── ETF Fundamentals ──
      const er = m.expenseRatio ?? 0.005;
      const erCat = m.expenseRatioCategory ?? 0.008;
      const expenseScore = clamp((0.005 - er) / 0.0045 * 40, 0, 40);

      const r1y = m.oneYearReturn ?? m.ytdReturn ?? 0;
      const r3y = m.threeYearReturn ?? 0;
      const r5y = m.fiveYearReturn ?? 0;
      const rytd = m.ytdReturn ?? 0;
      const blendedReturn = r1y * 0.4 + r3y * 0.3 + r5y * 0.2 + rytd * 0.1;
      const returnsScore = clamp(blendedReturn / 0.50 * 35, 0, 35);

      const volumeScore = clamp((m.avgVolume ?? 0) / 10_000_000 * 15, 0, 15);

      const trackingScore = clamp(100 - ((m.fundStdDev ?? 20) - 5) / 25 * 100, 0, 100) * 0.05 +
                              clamp((0.3 - (m.fundBeta ?? 1)) / 0.3 * 5, 0, 5);

      fundamentalsRaw = clamp(expenseScore + returnsScore + volumeScore + trackingScore, 0, 100);

      // ── ETF Market ──
      const momScore = clamp(blendedReturn / 0.40 * 38, 0, 38);
      const volScore = clamp(100 - ((m.fundStdDev ?? 20) - 10) / 20 * 100, 0, 100) * 0.27;
      const liqScore = clamp((m.avgVolume ?? 0) / 9_000_000 * 19, 0, 19);

      const rsi = prices.length >= 15 ? calculateRSI(prices) : undefined;
      const rsiScore = rsi !== undefined
        ? clamp((rsi - 30) / 40 * 100, 0, 100) * 0.15
        : 5;

      const sma50 = computeSMA(prices, 50);
      const sma200 = computeSMA(prices, 200);
      const latestPrice = prices[prices.length - 1];
      const aboveSma50 = latestPrice > (sma50 ?? Infinity);
      const aboveSma200 = latestPrice > (sma200 ?? Infinity);
      // Confirmed-uptrend bonus: reward classic MA stacking (price > 50DMA > 200DMA)
      // on top of the binary above/below checks. This lifts genuine breakouts that
      // are merely "above both SMAs" today, and is purely structural — no beta or
      // volatility term — so it never penalises low-beta defensives.
      const trendAligned = aboveSma50 && aboveSma200 && sma50 !== undefined && sma200 !== undefined && sma50 > sma200;
      const trendScore = (aboveSma50 ? 10 : 0) + (aboveSma200 ? 10 : 0) + (trendAligned ? 8 : 0);

      marketRaw = clamp(momScore + volScore + liqScore + rsiScore + trendScore, 0, 100);

      // ── ETF Balance ──
      const nameLower = name.toLowerCase();
      const fundCatLower = (m.fundCategory || '').toLowerCase();
      const custodyScore = nameLower.includes('physical') || fundCatLower.includes('commodities') || fundCatLower.includes('gold') ? 36 : 30;
      const leverageScore = 28;
      const familyLower = (m.fundFamily || '').toLowerCase();
      const transparencyScore = familyLower.includes('aberdeen') || familyLower.includes('vanguard') || familyLower.includes('blackrock') || familyLower.includes('ishares') || familyLower.includes('spdr') ? 18 : 15;
      const navScore = clamp(100 - Math.abs((m.fundBeta ?? 1) - 1) * 10, 0, 100) * 0.08;

      balanceRaw = clamp(custodyScore + leverageScore + transparencyScore + navScore, 0, 100);

      // ── ETF Leadership ──
      const inceptionYear = fundPerf?.performanceOverview?.asOfDate ?
        Math.min(new Date(fundPerf.performanceOverview.asOfDate).getFullYear() - 2009, 20) / 20 * 35 : 25;
      const feeCompetitive = erCat > 0 ? clamp((erCat - er) / erCat * 35, 0, 35) : 20;
      const issuerRep = familyLower.includes('aberdeen') ||
                        familyLower.includes('vanguard') ||
                        familyLower.includes('blackrock') ||
                        familyLower.includes('spdr') ? 28 : 24;

      leadershipRaw = clamp(inceptionYear + feeCompetitive + issuerRep, 0, 100);

      innovationRaw = 0;

      // ── ETF rule breakdown ──
      const trendDetail = `${aboveSma50 ? '>' : '<'}50DMA, ${aboveSma200 ? '>' : '<'}200DMA`;
      rule('Fundamentals', 'Expense ratio', asPct(er), expenseScore, 40);
      rule('Fundamentals', 'Blended returns', asPct(blendedReturn), returnsScore, 35);
      rule('Fundamentals', 'Volume', asCompact(m.avgVolume), volumeScore, 15);
      rule('Fundamentals', 'Tracking / risk', `β${(m.fundBeta ?? 1).toFixed(2)}`, trackingScore, 10);
      rule('Market Dynamics', 'Momentum', asPct(blendedReturn), momScore, 38);
      rule('Market Dynamics', 'Volatility', `σ${(m.fundStdDev ?? 20).toFixed(0)}`, volScore, 27);
      rule('Market Dynamics', 'Liquidity', asCompact(m.avgVolume), liqScore, 19);
      rule('Market Dynamics', 'RSI', rsi !== undefined ? rsi.toFixed(0) : 'n/a', rsiScore, 15);
      rule('Market Dynamics', 'Trend', trendDetail, (aboveSma50 ? 10 : 0) + (aboveSma200 ? 10 : 0), 20);
      rule('Market Dynamics', 'Confirmed uptrend', trendAligned ? '50DMA > 200DMA' : 'not aligned', trendAligned ? 8 : 0, 8);
      rule('Balance Sheet', 'Custody', custodyScore >= 36 ? 'physical' : 'standard', custodyScore, 36);
      rule('Balance Sheet', 'Leverage', 'unlevered', leverageScore, 28);
      rule('Balance Sheet', 'Transparency', transparencyScore >= 18 ? 'major issuer' : 'other', transparencyScore, 18);
      rule('Balance Sheet', 'NAV stability', `β${(m.fundBeta ?? 1).toFixed(2)}`, navScore, 8);
      rule('Leadership', 'Track record', inceptionYear >= 30 ? 'long' : 'medium', inceptionYear, 35);
      rule('Leadership', 'Fee competitiveness', asPct(er), feeCompetitive, 35);
      rule('Leadership', 'Issuer reputation', issuerRep >= 28 ? 'top-tier' : 'standard', issuerRep, 28);

    } else {
      // ── Stock Fundamentals ──
      const revGrowth = m.revenueGrowth ?? 0;
      const earnGrowth = m.earningsGrowth ?? 0;
      const margin = m.profitMargin ?? 0;
      const roe = m.roe ?? 0;
      const fcf = m.freeCashflow ?? 0;
      const fcfYield = marketCap > 0 ? fcf / marketCap : 0;
      const pe = m.trailingPE ?? 0;
      const pb = m.priceToBook ?? 0;

      const revScore = clamp(revGrowth / 0.50 * 20, 0, 20);
      const earnScore = clamp(earnGrowth / 0.50 * 10, 0, 10);
      const marginScore = clamp(margin / 0.30 * 20, 0, 20);
      const roeScore = clamp(roe / 0.30 * 20, 0, 20);
      const fcfScore = clamp((fcfYield + 0.01) / 0.05 * 15, 0, 15);
      const peScore = pe > 0 ? clamp(100 - (pe - 10) / 40 * 100, 0, 100) * 0.10 : 5;
      const pbScore = pb > 0 ? clamp(100 - (pb - 1) / 30 * 100, 0, 100) * 0.05 : 5;

      fundamentalsRaw = clamp(revScore + earnScore + marginScore + roeScore + fcfScore + peScore + pbScore, 0, 100);

      if (piotroskiRaw >= 7) fundamentalsRaw = Math.min(fundamentalsRaw + 5, 100);

      // ── Stock Market ──
      const mom6m = m.priceChange6m ?? 0;
      const momScore = clamp((mom6m + 0.4) / 0.8 * 40, 0, 40);
      const volScore = clamp(100 - (m.beta ?? 1) / 3 * 100, 0, 100) * 0.30;
      const volLiqScore = clamp((m.avgVolume ?? 0) / 10_000_000 * 20, 0, 20);

      const rsi = prices.length >= 15 ? calculateRSI(prices) : undefined;
      const rsiScore = rsi !== undefined
        ? clamp((rsi - 30) / 40 * 100, 0, 100) * 0.15
        : 5;

      const sma50 = computeSMA(prices, 50);
      const sma200 = computeSMA(prices, 200);
      const latestPrice = prices[prices.length - 1];
      const aboveSma50 = latestPrice > (sma50 ?? Infinity);
      const aboveSma200 = latestPrice > (sma200 ?? Infinity);
      // Confirmed-uptrend bonus: reward classic MA stacking (price > 50DMA > 200DMA)
      // on top of the binary above/below checks. This lifts genuine breakouts that
      // are merely "above both SMAs" today, and is purely structural — no beta or
      // volatility term — so it never penalises low-beta defensives.
      const trendAligned = aboveSma50 && aboveSma200 && sma50 !== undefined && sma200 !== undefined && sma50 > sma200;
      const trendScore = (aboveSma50 ? 10 : 0) + (aboveSma200 ? 10 : 0) + (trendAligned ? 8 : 0);

      marketRaw = clamp(momScore + volScore + volLiqScore + rsiScore + trendScore, 0, 100);

      // ── Stock Balance ──
      const cr = m.currentRatio ?? 0;
      const oi = m.operatingIncome ?? m.ebitda ?? 0;
      const td = m.totalDebt ?? 0;
      const ic = td > 0 ? oi / (td * 0.05) : 0;
      const cashDebt = m.totalCash && m.totalDebt ? m.totalCash / m.totalDebt : 0;
      const de = m.debtToEquity ?? 0;

      const crScore = cr > 0 ? clamp((cr - 0.5) / 2.5 * 25, 0, 25) : 12.5;
      const icScore = ic > 0 ? clamp((ic - 1) / 19 * 25, 0, 25) : 12.5;
      const cashScore = cashDebt > 0 ? clamp(cashDebt / 1 * 25, 0, 25) : 12.5;
      const deScore = de > 0 ? clamp(100 - (de - 50) / 150 * 100, 0, 100) * 0.25 : 12.5;

      balanceRaw = clamp(crScore + icScore + cashScore + deScore, 0, 100);

      if (altmanZRaw > 3) balanceRaw = Math.min(balanceRaw + 5, 100);

      // ── Stock Leadership ──
      const ebitda = m.ebitda ?? 0;
      const rev = m.revenue ?? 0;
      const ebitdaMargin = rev > 0 ? ebitda / rev : 0;
      const marginExec = margin > 0 ? clamp(margin / 0.25 * 25, 0, 25) : 12.5;

      const fcfYieldLeadership = marketCap > 0 ? (m.freeCashflow ?? 0) / marketCap : 0;
      const capitalReturn = m.dividendYield ? clamp(m.dividendYield / 0.03 * 20, 0, 20) :
                            (fcfYieldLeadership > 0.01 ? 18 : 12);

      const target = m.targetMeanPrice ?? 0;
      const analystScore = target > 0 && price > 0 ?
        clamp(100 - Math.abs(target - price) / price * 100, 0, 100) * 0.25 : 12.5;

      const consensusRating = mapConsensusRating(fmpRatings);
      const consensusScore = consensusRating === 'buy' ? 20 : consensusRating === 'hold' ? 10 : 0;

      const isTechStock = [
        'technology', 'software', 'semiconductors', 'biotechnology',
        'healthcare technology', 'internet content', 'computer software',
        'application software', 'advertising', 'media',
      ].some(s => sector.includes(s) || industry.includes(s));

      // Telecom/communication stocks are NOT tech-innovation stocks
      const isCommStock = ['communication', 'telecom', 'wireless', 'telecommunications']
        .some(s => sector.includes(s) || industry.includes(s));

      const strategyScore = isTechStock && margin > 0.20 ? 18 : 10;
      const governanceScore = 12;

      leadershipRaw = clamp(marginExec + capitalReturn + analystScore + strategyScore + governanceScore + consensusScore, 0, 100);

      // ── Stock Innovation ──

      if (isTechStock && !isCommStock) {
        const rd = m.rdExpense ?? 0;
        const rdRatio = rev > 0 ? rd / rev : 0;
        const rdScore = rdRatio > 0 ? clamp(rdRatio / 0.15 * 50, 0, 50) :
                        margin > 0.30 ? 35 :
                        margin > 0.15 ? 25 : 15;
        const moatScore = margin > 0.30 ? 28 : margin > 0.15 ? 20 : 10;
        const accelScore = revGrowth > 0.30 ? 20 : revGrowth > 0.15 ? 15 : 10;
        innovationRaw = clamp(rdScore + moatScore + accelScore, 0, 100);
        rule('Innovation', 'R&D intensity', asPct(rdRatio), rdScore, 50);
        rule('Innovation', 'Moat (margins)', asPct(margin), moatScore, 28);
        rule('Innovation', 'Growth acceleration', asPct(revGrowth), accelScore, 20);
      } else {
        innovationRaw = 0;
      }

      // ── Stock rule breakdown (fundamentals, market, balance, leadership) ──
      const trendDetail = `${aboveSma50 ? '>' : '<'}50DMA, ${aboveSma200 ? '>' : '<'}200DMA`;
      rule('Fundamentals', 'Revenue growth', asPct(revGrowth), revScore, 20);
      rule('Fundamentals', 'Earnings growth', asPct(earnGrowth), earnScore, 10);
      rule('Fundamentals', 'Profit margin', asPct(margin), marginScore, 20);
      rule('Fundamentals', 'Return on equity', asPct(roe), roeScore, 20);
      rule('Fundamentals', 'Free cash flow yield', asPct(fcfYield), fcfScore, 15);
      rule('Fundamentals', 'P/E valuation', pe > 0 ? pe.toFixed(1) : 'n/a', peScore, 10);
      rule('Fundamentals', 'P/B valuation', pb > 0 ? pb.toFixed(1) : 'n/a', pbScore, 5);
      rule('Fundamentals', 'Quality (Piotroski)', `${piotroskiRaw}/9`, piotroskiRaw >= 7 ? 5 : 0, 5);
      rule('Market Dynamics', 'Momentum', asPct(mom6m), momScore, 40);
      rule('Market Dynamics', 'Volatility', `β${(m.beta ?? 1).toFixed(2)}`, volScore, 30);
      rule('Market Dynamics', 'Volume / liquidity', asCompact(m.avgVolume), volLiqScore, 20);
      rule('Market Dynamics', 'RSI', rsi !== undefined ? rsi.toFixed(0) : 'n/a', rsiScore, 15);
      rule('Market Dynamics', 'Trend', trendDetail, (aboveSma50 ? 10 : 0) + (aboveSma200 ? 10 : 0), 20);
      rule('Market Dynamics', 'Confirmed uptrend', trendAligned ? '50DMA > 200DMA' : 'not aligned', trendAligned ? 8 : 0, 8);
      rule('Balance Sheet', 'Current ratio', cr > 0 ? cr.toFixed(2) : 'n/a', crScore, 25);
      rule('Balance Sheet', 'Interest coverage', ic > 0 ? ic.toFixed(1) + 'x' : 'n/a', icScore, 25);
      rule('Balance Sheet', 'Cash vs debt', cashDebt > 0 ? cashDebt.toFixed(2) + 'x' : 'n/a', cashScore, 25);
      rule('Balance Sheet', 'Debt / equity', de > 0 ? de.toFixed(0) : 'n/a', deScore, 25);
      rule('Balance Sheet', 'Solvency (Altman Z)', altmanZRaw > 0 ? altmanZRaw.toFixed(1) : 'n/a', altmanZRaw > 3 ? 5 : 0, 5);
      rule('Leadership', 'Margin execution', asPct(margin), marginExec, 25);
      rule('Leadership', 'Capital return', m.dividendYield ? asPct(m.dividendYield) : 'fcf', capitalReturn, 20);
      rule('Leadership', 'Analyst target', target > 0 ? '$' + target.toFixed(0) : 'n/a', analystScore, 25);
      rule('Leadership', 'Strategy', isTechStock && margin > 0.20 ? 'tech leader' : 'standard', strategyScore, 18);
      rule('Leadership', 'Governance', 'baseline', governanceScore, 12);
      rule('Leadership', 'Analyst consensus', consensusRating ?? 'n/a', consensusScore, 20);
    }

    // ── Weights ──
    let weights = {
      fundamentals: 30,
      marketDynamics: 15,
      balanceSheet: 15,
      leadership: 15,
      innovation: 15,
      ethics: 10,
    };

    if (isETF || innovationRaw === 0) {
      weights = {
        fundamentals: 35,
        marketDynamics: 18.75,
        balanceSheet: 18.75,
        leadership: 17.5,
        innovation: 0,
        ethics: 10,
      };
    }

    // Apply per-user custom weights if telegramId provided
    if (telegramId) {
      try {
        const uw = getUserWeights(telegramId);
        // Map user's weight categories to OpenBox pillars
        const userFundamentals = (uw.valuation + uw.profitability + uw.growth) / 3;
        const userMarket = uw.momentum;
        const userBalance = uw.financial_health;

        // Scale defaults by user's preference relative to 50 (midpoint)
        const scale = (val: number) => Math.max(0.2, Math.min(3.0, val / 50));

        if (isETF || innovationRaw === 0) {
          weights = {
            fundamentals: clamp(35 * scale(userFundamentals), 5, 60),
            marketDynamics: clamp(18.75 * scale(userMarket), 2, 40),
            balanceSheet: clamp(18.75 * scale(userBalance), 2, 40),
            leadership: clamp(17.5, 2, 40),
            innovation: 0,
            ethics: 10,
          };
        } else {
          weights = {
            fundamentals: clamp(30 * scale(userFundamentals), 5, 55),
            marketDynamics: clamp(15 * scale(userMarket), 2, 35),
            balanceSheet: clamp(15 * scale(userBalance), 2, 35),
            leadership: clamp(15, 2, 35),
            innovation: clamp(15, 2, 35),
            ethics: 10,
          };
        }

        // Normalize to sum ~100
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        if (total > 0) {
          const factor = 100 / total;
          weights = {
            fundamentals: weights.fundamentals * factor,
            marketDynamics: weights.marketDynamics * factor,
            balanceSheet: weights.balanceSheet * factor,
            leadership: weights.leadership * factor,
            innovation: weights.innovation * factor,
            ethics: weights.ethics * factor,
          };
        }
      } catch (err) {
        logger.warn('Failed to apply user weights', { telegramId, error: (err as Error).message });
      }
    }

    const wf = (fundamentalsRaw / 100) * weights.fundamentals;
    const wm = (marketRaw / 100) * weights.marketDynamics;
    const wb = (balanceRaw / 100) * weights.balanceSheet;
    const wl = (leadershipRaw / 100) * weights.leadership;
    const wi = (innovationRaw / 100) * weights.innovation;
    const we = 10;

    let subtotal = wf + wm + wb + wl + wi + we;

    // ── Adjustments ──
    const peVal = toNum(sd?.trailingPE);
    const peer = computePeerDelta(peVal, sector, industry);
    const dom = checkDominance(upper, sector);

    subtotal += peer.peerDelta + dom.dominanceBonus;

    // Adjustments are signed bonuses/penalties (max = 0 flags them as such).
    if (peer.peerDelta !== 0) {
      rule('Adjustments', 'Peer valuation', peer.peerDelta > 0 ? 'cheaper vs peers' : 'pricier vs peers', peer.peerDelta, 0);
    }
    if (dom.dominanceBonus !== 0) {
      rule('Adjustments', 'Market dominance', 'category leader', dom.dominanceBonus, 0);
    }

    const finalScore = clamp(Math.round(subtotal), 0, 100);

    // ── Risk flags ──
    const riskFlags = generateRiskFlags(m, isETF, sector, industry, name, priceChange6m, priceChangeYtd);

    // ── Narrative ──
    const narrative = generateNarrative(
      fundamentalsRaw, marketRaw, balanceRaw, isETF, sector, industry, name,
      riskFlags, finalScore, priceChange6m, priceChangeYtd
    );

    return {
      finalScore,
      pillars: {
        fundamentals: clamp(Math.round(wf), 0, weights.fundamentals),
        marketDynamics: clamp(Math.round(wm), 0, weights.marketDynamics),
        balanceSheet: clamp(Math.round(wb), 0, weights.balanceSheet),
        leadership: clamp(Math.round(wl), 0, weights.leadership),
        innovation: clamp(Math.round(wi), 0, weights.innovation),
        ethics: 10,
      },
      riskFlags,
      narrative,
      ethicsPass: true,
      adjustments: {
        peerDelta: peer.peerDelta,
        dominanceBonus: dom.dominanceBonus,
      },
      breakdown,
      isETF,
      sector: sectorRaw || undefined,
      industry: industryRaw || undefined,
    };

  } catch (err) {
    logger.error('OpenBox engine failed', { ticker: upper, error: (err as Error).message });
    return null;
  }
}

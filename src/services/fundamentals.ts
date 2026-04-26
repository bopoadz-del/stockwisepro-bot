import { logger } from '../utils/logger';

function safeDiv(a: number | null | undefined, b: number | null | undefined): number {
  const num = Number(a);
  const den = Number(b);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Altman Z-Score ─────────────────────────────────────────────────────────

export interface AltmanInput {
  workingCapital: number;
  totalAssets: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  totalLiabilities: number;
  revenue: number;
}

export interface AltmanResult {
  raw: number;
  score: number;
  zone: 'safe' | 'grey' | 'distress';
}

export function altmanZScore(data: AltmanInput): AltmanResult {
  const A = safeDiv(data.workingCapital, data.totalAssets);
  const B = safeDiv(data.retainedEarnings, data.totalAssets);
  const C = safeDiv(data.ebit, data.totalAssets);
  const D = safeDiv(data.marketCap, data.totalLiabilities);
  const E = safeDiv(data.revenue, data.totalAssets);

  const Z = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
  const normalized = Math.max(0, Math.min((Z / 3.5) * 100, 100));

  let zone: AltmanResult['zone'] = 'distress';
  if (Z > 3) zone = 'safe';
  else if (Z > 1.8) zone = 'grey';

  return { raw: Math.round(Z * 1000) / 1000, score: Math.round(normalized * 100) / 100, zone };
}

// ── Piotroski F-Score ──────────────────────────────────────────────────────

export interface PiotroskiInput {
  netIncome: number;
  totalAssets: number;
  operatingCashflow: number;
  longTermDebt: number;
  currentAssets: number;
  currentLiabilities: number;
  sharesOutstanding: number;
  grossMargin: number;
  revenue: number;
}

export interface PiotroskiResult {
  raw: number;
  score: number;
}

export function piotroskiFScore(current: PiotroskiInput, previous: PiotroskiInput): PiotroskiResult {
  let score = 0;

  // Profitability
  if (current.netIncome > 0) score += 1;
  if (safeDiv(current.netIncome, current.totalAssets) > 0) score += 1;
  if (current.operatingCashflow > 0) score += 1;
  if (current.operatingCashflow > current.netIncome) score += 1;

  // Leverage / Liquidity
  if (current.longTermDebt < previous.longTermDebt) score += 1;
  if (safeDiv(current.currentAssets, current.currentLiabilities) > safeDiv(previous.currentAssets, previous.currentLiabilities)) score += 1;
  if (current.sharesOutstanding <= previous.sharesOutstanding) score += 1;

  // Operating Efficiency
  if (safeDiv(current.grossMargin, current.revenue) > safeDiv(previous.grossMargin, previous.revenue)) score += 1;
  if (safeDiv(current.revenue, current.totalAssets) > safeDiv(previous.revenue, previous.totalAssets)) score += 1;

  const normalized = score * 11.111;
  return { raw: score, score: Math.round(normalized * 100) / 100 };
}

// ── Composite ──────────────────────────────────────────────────────────────

export interface FundamentalsComposite {
  altman_z: AltmanResult;
  piotroski_f: PiotroskiResult;
  composite: number;
  confidence: number; // 0–1, how complete the input data was
}

export function fundamentalsComposite(
  altmanData: AltmanInput,
  current: PiotroskiInput,
  previous: PiotroskiInput
): FundamentalsComposite {
  const altman = altmanZScore(altmanData);
  const piotroski = piotroskiFScore(current, previous);

  // Count how many fields were non-zero (proxy for data completeness)
  const altmanFields = [altmanData.workingCapital, altmanData.totalAssets, altmanData.retainedEarnings, altmanData.ebit, altmanData.marketCap, altmanData.totalLiabilities, altmanData.revenue].filter(v => Number.isFinite(v) && v !== 0).length;
  const piotroFields = [
    current.netIncome, current.totalAssets, current.operatingCashflow,
    current.longTermDebt, current.currentAssets, current.currentLiabilities,
    current.sharesOutstanding, current.grossMargin, current.revenue,
    previous.netIncome, previous.totalAssets, previous.operatingCashflow,
    previous.longTermDebt, previous.currentAssets, previous.currentLiabilities,
    previous.sharesOutstanding, previous.grossMargin, previous.revenue,
  ].filter(v => Number.isFinite(v) && v !== 0).length;

  const confidence = Math.round(((altmanFields / 7) * 0.5 + (piotroFields / 18) * 0.5) * 100) / 100;

  return {
    altman_z: altman,
    piotroski_f: piotroski,
    composite: Math.round((altman.score * 0.5 + piotroski.score * 0.5) * 100) / 100,
    confidence,
  };
}

// ── Yahoo Finance → Engine mapping ─────────────────────────────────────────

export function mapYahooToFundamentals(
  quote: any,
  financialData: any,
  defaultKeyStatistics: any,
  incomeStatementHistory: any[]
): FundamentalsComposite | null {
  try {
    const price = toNum(quote?.regularMarketPrice ?? financialData?.currentPrice);
    const sharesOutstanding = toNum(defaultKeyStatistics?.sharesOutstanding);
    const marketCap = price * sharesOutstanding;
    const bookValue = toNum(defaultKeyStatistics?.bookValue);
    const priceToBook = toNum(defaultKeyStatistics?.priceToBook);

    // Proxies for missing balance sheet data
    const totalAssets = priceToBook > 0 ? marketCap / priceToBook : 0;
    const workingCapital = toNum(financialData?.totalCash); // proxy
    const retainedEarnings = bookValue; // proxy
    const ebit = toNum(financialData?.ebitda); // proxy
    const totalLiabilities = toNum(financialData?.totalDebt); // proxy
    const revenue = toNum(financialData?.totalRevenue);

    const altmanData: AltmanInput = {
      workingCapital,
      totalAssets,
      retainedEarnings,
      ebit,
      marketCap,
      totalLiabilities,
      revenue,
    };

    const currStmt = incomeStatementHistory?.[0] || {};
    const prevStmt = incomeStatementHistory?.[1] || {};

    const current: PiotroskiInput = {
      netIncome: toNum(currStmt?.netIncome),
      totalAssets,
      operatingCashflow: toNum(financialData?.operatingCashflow),
      longTermDebt: toNum(financialData?.totalDebt),
      currentAssets: toNum(financialData?.totalCash), // proxy
      currentLiabilities: toNum(financialData?.totalDebt), // proxy
      sharesOutstanding,
      grossMargin: toNum(currStmt?.grossProfit),
      revenue: toNum(currStmt?.totalRevenue),
    };

    const prevTotalAssets = priceToBook > 0 ? (price * sharesOutstanding) / priceToBook : 0;
    const previous: PiotroskiInput = {
      netIncome: toNum(prevStmt?.netIncome),
      totalAssets: prevTotalAssets,
      operatingCashflow: toNum(financialData?.operatingCashflow), // no historical
      longTermDebt: toNum(financialData?.totalDebt), // no historical
      currentAssets: toNum(financialData?.totalCash),
      currentLiabilities: toNum(financialData?.totalDebt),
      sharesOutstanding,
      grossMargin: toNum(prevStmt?.grossProfit),
      revenue: toNum(prevStmt?.totalRevenue),
    };

    return fundamentalsComposite(altmanData, current, previous);
  } catch (err) {
    logger.error('mapYahooToFundamentals failed', { error: (err as Error).message });
    return null;
  }
}

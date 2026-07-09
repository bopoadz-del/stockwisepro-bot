/**
 * Peer comparison using sector median P/E.
 * Fetches sector/industry from Yahoo quoteSummary('summaryProfile').
 * 
 * NEW v2.0: Added scorePeRelative, scorePeBlended, scorePeROEAdjusted
 * for fairer valuation scoring across sectors and quality levels.
 */

// Hardcoded sector median P/E map (kept simple — update quarterly or source from FMP)
const SECTOR_MEDIAN_PE: Record<string, number> = {
  'technology': 28,
  'software': 32,
  'semiconductors': 25,
  'healthcare': 22,
  'pharmaceuticals': 18,
  'finance': 14,
  'banks': 12,
  'energy': 10,
  'oil & gas': 10,
  'consumer': 20,
  'consumer cyclical': 18,
  'consumer defensive': 22,
  'industrials': 18,
  'utilities': 16,
  'real estate': 16,
  'materials': 14,
  'communication services': 20,
  'telecom': 14,
  'entertainment': 24,
};

function getSectorMedianPE(sector?: string, industry?: string): number {
  const keys = [
    (industry || '').toLowerCase().trim(),
    (sector || '').toLowerCase().trim(),
  ];
  for (const key of keys) {
    if (SECTOR_MEDIAN_PE[key]) return SECTOR_MEDIAN_PE[key];
  }
  return 18; // default
}

export interface PeerResult {
  peerDelta: number; // clamped -4 to +4
  sector?: string;
  industry?: string;
  sectorMedianPE?: number;
}

export function computePeerDelta(
  pe: number,
  sector?: string,
  industry?: string
): PeerResult {
  const median = getSectorMedianPE(sector, industry);

  if (!Number.isFinite(pe) || pe <= 0) {
    return { peerDelta: 0, sector, industry, sectorMedianPE: median };
  }

  const rawDelta = ((median - pe) / median) * 10;
  const peerDelta = Math.max(-4, Math.min(4, Math.round(rawDelta)));

  return { peerDelta, sector, industry, sectorMedianPE: median };
}

// ═══════════════════════════════════════════════════════════════════════
// NEW v2.0: Enhanced P/E Scoring Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * FIX 1: Sector-relative P/E scoring.
 * A utility with P/E 23 isn't expensive — that's normal for utilities.
 * Score 100 at 0.5x median, 50 at 1x median, 0 at 2x median.
 */
export function scorePeRelative(pe: number, sector?: string, industry?: string): number {
  const median = getSectorMedianPE(sector, industry);
  if (!pe || pe <= 0) return 50;
  const ratio = pe / median;
  return Math.max(0, Math.min(100, 100 - (ratio - 0.5) * 100));
}

/**
 * FIX 2: Blend trailing and forward P/E for more accurate valuation.
 * Forward P/E captures earnings trajectory that trailing P/E misses.
 * Weight forward more when earnings are growing into it.
 */
export function scorePeBlended(
  trailingPE: number,
  forwardPE: number | undefined,
  sector?: string,
  industry?: string
): number {
  if (!forwardPE || forwardPE <= 0) {
    return scorePeRelative(trailingPE, sector, industry);
  }
  const trailingScore = scorePeRelative(trailingPE, sector, industry);
  const forwardScore = scorePeRelative(forwardPE, sector, industry);
  // Weight forward more when earnings are growing into it
  const isEarningsGrowing = forwardPE < trailingPE * 0.7;
  const forwardWeight = isEarningsGrowing ? 0.7 : 0.5;
  return trailingScore * (1 - forwardWeight) + forwardScore * forwardWeight;
}

/**
 * FIX 3: ROE-adjusted P/E scoring.
 * A company earning 30% ROE deserves a higher P/E than one earning 5%.
 * Justified P/E ≈ ROE * retention_ratio * 100
 */
export function scorePeROEAdjusted(
  pe: number,
  roe: number | undefined,
  sector?: string,
  industry?: string
): number {
  if (!roe || roe <= 0 || !pe || pe <= 0) {
    return scorePeRelative(pe, sector, industry);
  }
  const justifiedPE = Math.max(10, roe * 100 * 0.8);
  const ratio = pe / justifiedPE;
  return Math.max(0, Math.min(100, 100 - (ratio - 0.5) * 100));
}

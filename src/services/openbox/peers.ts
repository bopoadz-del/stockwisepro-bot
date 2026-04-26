/**
 * Peer comparison using sector median P/E.
 * Fetches sector/industry from Yahoo quoteSummary('summaryProfile').
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
  const lookupKey = (industry || sector || '').toLowerCase().trim();

  // Find closest sector match
  let median = SECTOR_MEDIAN_PE[lookupKey];
  if (!median && sector) {
    const sectorKey = sector.toLowerCase().trim();
    median = SECTOR_MEDIAN_PE[sectorKey];
  }
  if (!median && industry) {
    const indKey = industry.toLowerCase().trim();
    median = SECTOR_MEDIAN_PE[indKey];
  }

  // Default fallback if no sector match
  if (!median) {
    median = 18;
  }

  if (!Number.isFinite(pe) || pe <= 0) {
    return { peerDelta: 0, sector, industry, sectorMedianPE: median };
  }

  // Delta: how many standard deviations below/over median
  // Simplified: (median - pe) / median * 10, clamped
  const rawDelta = ((median - pe) / median) * 10;
  const peerDelta = Math.max(-4, Math.min(4, Math.round(rawDelta)));

  return { peerDelta, sector, industry, sectorMedianPE: median };
}

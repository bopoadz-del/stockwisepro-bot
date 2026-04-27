/**
 * Risk flag generator.
 * Analyzes metrics and returns string[] warnings.
 */

export interface RiskFlags {
  flags: string[];
  count: number;
  severity: 'low' | 'moderate' | 'high';
}

export function analyzeRisks(
  metrics: {
    operatingCashflow?: number;
    debtToEquity?: number;
    margin?: number;
    currentRatio?: number;
    altmanZRaw?: number;
    piotroskiRaw?: number;
  },
  isETF = false
): RiskFlags {
  const flags: string[] = [];

  if (!isETF && metrics.operatingCashflow !== undefined && metrics.operatingCashflow <= 0) {
    flags.push('Weak cash flow');
  }

  if (metrics.debtToEquity !== undefined && metrics.debtToEquity > 100) {
    flags.push('High leverage');
  }

  if (metrics.margin !== undefined && metrics.margin < 0.05) {
    flags.push('Declining margins');
  }

  if (metrics.currentRatio !== undefined && metrics.currentRatio < 1) {
    flags.push('Low liquidity');
  }

  if (!isETF && metrics.altmanZRaw !== undefined && metrics.altmanZRaw < 1.8) {
    flags.push('Distress zone');
  }

  if (!isETF && metrics.piotroskiRaw !== undefined && metrics.piotroskiRaw < 4) {
    flags.push('Low quality');
  }

  let severity: RiskFlags['severity'] = 'low';
  if (flags.length >= 3) severity = 'high';
  else if (flags.length >= 1) severity = 'moderate';

  return { flags, count: flags.length, severity };
}

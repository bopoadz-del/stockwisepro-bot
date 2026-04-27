import { logger } from '../utils/logger';
import { checkEthics } from './openbox/ethics';
import {
  loadStockUniverse,
  loadInvestorProfiles,
  loadCongressTraders,
  getStockByTicker,
  InvestorProfile,
  StockUniverseEntry,
} from './universe';

export interface ScreenedHolding {
  ticker: string;
  percentage: number;
  sector: string;
  reason: string;
}

export interface ScreenResult {
  holdings: ScreenedHolding[];
  investorName: string;
  ethicsApplied: boolean;
  replacedTickers?: Array<{ old: string; new: string; reason: string }>;
}

function normalizeWeights(holdings: ScreenedHolding[]): ScreenedHolding[] {
  const total = holdings.reduce((sum, h) => sum + h.percentage, 0);
  if (total === 0) return holdings;
  return holdings.map(h => ({ ...h, percentage: parseFloat(((h.percentage / total) * 100).toFixed(2)) }));
}

function sortByStyleMatch(stocks: StockUniverseEntry[], preferredStyles: string[]): StockUniverseEntry[] {
  const prefs = preferredStyles.map(s => s.toLowerCase());
  return [...stocks].sort((a, b) => {
    const aScore = a.styles.filter(s => prefs.includes(s.toLowerCase())).length;
    const bScore = b.styles.filter(s => prefs.includes(s.toLowerCase())).length;
    return bScore - aScore;
  });
}

function applyEthicsFilter(stocks: StockUniverseEntry[]): StockUniverseEntry[] {
  const filtered: StockUniverseEntry[] = [];
  for (const stock of stocks) {
    const result = checkEthics(stock.ticker, stock.sector, '', stock.name);
    if (result.pass) {
      filtered.push(stock);
    } else {
      logger.info('Ethics filter excluded', { ticker: stock.ticker, violations: result.violations });
    }
  }
  return filtered;
}

export function screenPortfolio(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): ScreenResult | null {
  const profiles = loadInvestorProfiles();
  const traders = loadCongressTraders();
  const universe = loadStockUniverse();

  // Check if it's a congress trader (strip congress: prefix if present)
  const cleanId = investorId.startsWith('congress:') ? investorId.replace('congress:', '') : investorId;
  if (traders[cleanId]) {
    return buildCongressPortfolio(investorId, traders[cleanId], ethicsEnabled, userReplacements);
  }

  const profile = profiles[investorId];
  if (!profile) {
    logger.warn('Unknown investor/trader for screening', { investorId });
    return null;
  }

  return buildInvestorPortfolio(investorId, profile, universe, ethicsEnabled, userReplacements);
}

function buildInvestorPortfolio(
  investorId: string,
  profile: InvestorProfile,
  universe: StockUniverseEntry[],
  ethicsEnabled: boolean,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): ScreenResult {
  const holdings: ScreenedHolding[] = [];
  const replaced: Array<{ old: string; new: string; reason: string }> = [];

  // 1. Start with core holdings if they exist in universe
  const coreHoldings = profile.coreHoldings.filter(t => universe.some(s => s.ticker === t));
  const coreWeight = Math.min(coreHoldings.length * 8, 50); // up to 50% for core
  const corePerStock = coreHoldings.length > 0 ? coreWeight / coreHoldings.length : 0;

  for (const ticker of coreHoldings) {
    const stock = getStockByTicker(ticker)!;
    holdings.push({ ticker, percentage: corePerStock, sector: stock.sector, reason: 'core holding' });
  }

  // 2. Build sector allocations
  const sectors = Object.entries(profile.sectorTargets).sort((a, b) => b[1] - a[1]);
  const remainingWeight = 100 - holdings.reduce((s, h) => s + h.percentage, 0);

  for (const [sector, targetPct] of sectors) {
    if (profile.excludeSectors.includes(sector)) continue;

    let candidates = universe.filter(s => s.sector === sector && !coreHoldings.includes(s.ticker));
    if (candidates.length === 0) continue;

    if (ethicsEnabled) {
      candidates = applyEthicsFilter(candidates);
    }

    candidates = sortByStyleMatch(candidates, profile.preferredStyles);

    // How many stocks to pick from this sector
    const sectorSlots = Math.max(1, Math.round(targetPct / 8));
    const sectorWeight = (targetPct / 100) * remainingWeight;
    const weightPerStock = sectorWeight / sectorSlots;

    const picked = candidates.slice(0, sectorSlots);
    for (const stock of picked) {
      holdings.push({
        ticker: stock.ticker,
        percentage: weightPerStock,
        sector: stock.sector,
        reason: `${profile.style} fit`,
      });
    }
  }

  // 3. Handle user replacements
  if (userReplacements && userReplacements.length > 0) {
    for (const rep of userReplacements) {
      const oldIdx = holdings.findIndex(h => h.ticker.toUpperCase() === rep.oldTicker.toUpperCase());
      if (oldIdx === -1) continue;

      const oldHolding = holdings[oldIdx];
      let replacementTicker = rep.newTicker;

      if (!replacementTicker) {
        // Auto-find replacement in same sector with same style
        let candidates = universe.filter(
          s => s.sector === oldHolding.sector && s.ticker !== oldHolding.ticker
        );
        if (ethicsEnabled) candidates = applyEthicsFilter(candidates);
        candidates = sortByStyleMatch(candidates, profile.preferredStyles);
        replacementTicker = candidates[0]?.ticker;
      }

      if (replacementTicker) {
        const newStock = getStockByTicker(replacementTicker);
        if (newStock) {
          holdings[oldIdx] = {
            ticker: newStock.ticker,
            percentage: oldHolding.percentage,
            sector: newStock.sector,
            reason: `replaced ${rep.oldTicker}`,
          };
          replaced.push({ old: rep.oldTicker, new: newStock.ticker, reason: 'user replacement' });
        }
      }
    }
  }

  // 4. Deduplicate and normalize
  const deduped = new Map<string, ScreenedHolding>();
  for (const h of holdings) {
    const key = h.ticker.toUpperCase();
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      existing.percentage += h.percentage;
    } else {
      deduped.set(key, { ...h });
    }
  }

  const normalized = normalizeWeights([...deduped.values()]);
  logger.info('Portfolio screened', {
    investorId,
    ethicsEnabled,
    holdingsCount: normalized.length,
    replacedCount: replaced.length,
  });

  return {
    holdings: normalized,
    investorName: profile.name,
    ethicsApplied: ethicsEnabled,
    replacedTickers: replaced.length > 0 ? replaced : undefined,
  };
}

function buildCongressPortfolio(
  traderId: string,
  trader: { name: string; holdings: string[]; style: string },
  ethicsEnabled: boolean,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): ScreenResult {
  const universe = loadStockUniverse();
  const holdings: ScreenedHolding[] = [];
  const replaced: Array<{ old: string; new: string; reason: string }> = [];

  let validHoldings = trader.holdings.filter(t => universe.some(s => s.ticker === t));

  if (ethicsEnabled) {
    validHoldings = validHoldings.filter(t => {
      const stock = getStockByTicker(t);
      if (!stock) return false;
      const result = checkEthics(stock.ticker, stock.sector, '', stock.name);
      return result.pass;
    });
  }

  const weight = validHoldings.length > 0 ? 100 / validHoldings.length : 0;
  for (const ticker of validHoldings) {
    const stock = getStockByTicker(ticker);
    if (stock) {
      holdings.push({ ticker, percentage: weight, sector: stock.sector, reason: 'congress disclosure' });
    }
  }

  // Handle replacements
  if (userReplacements && userReplacements.length > 0) {
    for (const rep of userReplacements) {
      const oldIdx = holdings.findIndex(h => h.ticker.toUpperCase() === rep.oldTicker.toUpperCase());
      if (oldIdx === -1) continue;
      const oldH = holdings[oldIdx];
      let newTicker = rep.newTicker;
      if (!newTicker) {
        // Pick from same sector or tech if congress trader
        const candidates = universe.filter(
          s => s.sector === oldH.sector && s.ticker !== oldH.ticker
        );
        newTicker = candidates[0]?.ticker;
      }
      if (newTicker) {
        const ns = getStockByTicker(newTicker);
        if (ns) {
          holdings[oldIdx] = { ticker: ns.ticker, percentage: oldH.percentage, sector: ns.sector, reason: `replaced ${rep.oldTicker}` };
          replaced.push({ old: rep.oldTicker, new: ns.ticker, reason: 'user replacement' });
        }
      }
    }
  }

  const normalized = normalizeWeights(holdings);
  return {
    holdings: normalized,
    investorName: trader.name,
    ethicsApplied: ethicsEnabled,
    replacedTickers: replaced.length > 0 ? replaced : undefined,
  };
}

export function findReplacement(
  ticker: string,
  investorId: string,
  ethicsEnabled: boolean = false
): string | null {
  const profiles = loadInvestorProfiles();
  const traders = loadCongressTraders();
  const universe = loadStockUniverse();
  const stock = getStockByTicker(ticker);
  if (!stock) return null;

  const cleanId = investorId.startsWith('congress:') ? investorId.replace('congress:', '') : investorId;
  const profile = profiles[cleanId];
  const preferredStyles = profile?.preferredStyles || ['safe', 'growth'];

  let candidates = universe.filter(
    s => s.sector === stock.sector && s.ticker !== stock.ticker
  );
  if (ethicsEnabled) candidates = applyEthicsFilter(candidates);
  candidates = sortByStyleMatch(candidates, preferredStyles);

  return candidates[0]?.ticker || null;
}

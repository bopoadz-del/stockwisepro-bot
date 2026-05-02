import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────

export interface SheetHolding {
  ticker: string;
  percentage: number;
  sector: string;
  reason: string;
}

export interface SheetPortfolio {
  holdings: SheetHolding[];
  investorName: string;
  ethicsApplied: boolean;
  replacedTickers?: Array<{ old: string; new: string; reason: string }>;
}

interface CategoryDef {
  name: string;
  tickers: string[];
}

interface RiskProfile {
  label: string;
  beta_max: number;
  dividend_preferred: boolean;
  pe_max: number;
  volatility: string;
  max_single_stock: number;
  min_holdings: number;
}

interface InvestorFormula {
  type: string;
  sectors?: Record<string, number>;
  categories?: Record<string, number>;
  risk_profile: string;
  core_holdings?: string[];
  core_weight?: number;
  max_per_stock: number;
  min_holdings: number;
}

interface InvestorDef {
  name: string;
  style: string;
  description: string;
  formula: InvestorFormula;
  replacement: { strategy: string; candidates: number };
}

interface CongressDef {
  name: string;
  style: string;
  description: string;
  declared_stocks: string[];
  trading_pattern: string;
  sectors: Record<string, number>;
  formula: { type: string; risk_profile: string; max_per_stock: number; min_holdings: number };
  replacement: { strategy: string; candidates: number };
}

interface SheetData {
  version: string;
  categories: Record<string, CategoryDef>;
  risk_profiles: Record<string, RiskProfile>;
  investors: Record<string, InvestorDef>;
  congress: Record<string, CongressDef>;
  replacement_strategies: Record<string, { description: string; steps: string[] }>;
}

// ── Sheet Loader ───────────────────────────────────────────────────

let _sheet: SheetData | null = null;

function loadSheet(): SheetData {
  if (_sheet) return _sheet;
  const path = resolve(__dirname, '../../data/investor_sheet.json');
  const raw = readFileSync(path, 'utf-8');
  _sheet = JSON.parse(raw) as SheetData;
  logger.info('Investor sheet loaded', { version: _sheet.version });
  return _sheet;
}

export function reloadSheet(): SheetData {
  _sheet = null;
  return loadSheet();
}

// ── Portfolio Builder ──────────────────────────────────────────────

export function buildPortfolioFromSheet(
  investorId: string,
  ethicsEnabled: boolean = false,
  userReplacements?: Array<{ oldTicker: string; newTicker?: string }>
): SheetPortfolio | null {
  const sheet = loadSheet();

  const isCongress = investorId.startsWith('congress:');
  const cleanId = isCongress ? investorId.replace('congress:', '') : investorId;

  let def: InvestorDef | CongressDef | undefined;
  if (isCongress) {
    def = sheet.congress[cleanId];
  } else {
    def = sheet.investors[cleanId];
  }

  if (!def) {
    logger.warn('No sheet definition for investor', { investorId });
    return null;
  }

  const formula = def.formula;
  const riskProfile = sheet.risk_profiles[formula.risk_profile];

  // Determine allocation targets
  let targets: Record<string, number>;
  if ('categories' in formula && formula.categories) {
    targets = formula.categories;
  } else if ('sectors' in formula && formula.sectors) {
    targets = formula.sectors;
  } else {
    targets = (def as CongressDef).sectors || {};
  }

  // Build holdings
  const holdings: SheetHolding[] = [];
  const usedTickers = new Set<string>();

  // 1. Core holdings
  const core = formula.core_holdings || [];
  const coreWeight = formula.core_weight || 0;
  const corePerStock = core.length > 0 ? coreWeight / core.length : 0;
  for (const ticker of core) {
    const cat = findCategoryForTicker(ticker, sheet);
    holdings.push({ ticker, percentage: corePerStock, sector: cat || 'Core', reason: 'core holding' });
    usedTickers.add(ticker.toUpperCase());
  }

  // 2. Sector/category allocation
  const remainingWeight = 100 - holdings.reduce((s, h) => s + h.percentage, 0);
  const targetTotal = Object.values(targets).reduce((a, b) => a + b, 0);

  for (const [key, targetPct] of Object.entries(targets)) {
    const category = sheet.categories[key];
    if (!category) continue;

    let candidates = [...category.tickers];
    // Remove used tickers
    candidates = candidates.filter(t => !usedTickers.has(t.toUpperCase()));
    // Remove ethics violations if enabled
    if (ethicsEnabled) {
      candidates = candidates.filter(t => !isEthicsViolation(t));
    }
    if (candidates.length === 0) continue;

    const sectorWeight = (targetPct / targetTotal) * remainingWeight;
    const slots = Math.max(1, Math.round(targetPct / 8));
    const weightPerStock = sectorWeight / Math.min(slots, candidates.length);
    const picked = candidates.slice(0, Math.min(slots, candidates.length));

    for (const ticker of picked) {
      holdings.push({
        ticker,
        percentage: weightPerStock,
        sector: category.name,
        reason: `${def.style} fit`,
      });
      usedTickers.add(ticker.toUpperCase());
    }
  }

  // 3. Apply user replacements
  const replaced: Array<{ old: string; new: string; reason: string }> = [];
  if (userReplacements && userReplacements.length > 0) {
    for (const rep of userReplacements) {
      const oldIdx = holdings.findIndex(h => h.ticker.toUpperCase() === rep.oldTicker.toUpperCase());
      if (oldIdx === -1) continue;

      const oldH = holdings[oldIdx];
      let replacementTicker = rep.newTicker;

      if (!replacementTicker) {
        // Auto-find replacement using sheet strategy
        const strategy = def.replacement.strategy;
        const candidates = findReplacementCandidates(rep.oldTicker, oldH.sector, strategy, sheet, usedTickers, ethicsEnabled);
        replacementTicker = candidates[0];
      }

      if (replacementTicker) {
        const cat = findCategoryForTicker(replacementTicker, sheet);
        holdings[oldIdx] = {
          ticker: replacementTicker,
          percentage: oldH.percentage,
          sector: cat || oldH.sector,
          reason: `replaced ${rep.oldTicker}`,
        };
        replaced.push({ old: rep.oldTicker, new: replacementTicker, reason: 'user replacement' });
      }
    }
  }

  // 4. Normalize weights to sum to 100%
  const normalized = normalizeWeights(holdings, riskProfile?.max_single_stock || 25);

  return {
    holdings: normalized,
    investorName: def.name,
    ethicsApplied: ethicsEnabled,
    replacedTickers: replaced.length > 0 ? replaced : undefined,
  };
}

// ── Replacement Engine ─────────────────────────────────────────────

export function findReplacementCandidates(
  oldTicker: string,
  oldSector: string,
  strategy: string,
  sheet?: SheetData,
  excludeTickers?: Set<string>,
  ethicsEnabled?: boolean
): string[] {
  const s = sheet || loadSheet();

  // Find which category the old ticker belongs to
  let sourceCategory: CategoryDef | null = null;
  for (const cat of Object.values(s.categories)) {
    if (cat.tickers.some(t => t.toUpperCase() === oldTicker.toUpperCase())) {
      sourceCategory = cat;
      break;
    }
  }

  if (!sourceCategory) {
    // Fallback: search all categories
    for (const cat of Object.values(s.categories)) {
      if (cat.name === oldSector || cat.name.includes(oldSector)) {
        sourceCategory = cat;
        break;
      }
    }
  }

  if (!sourceCategory) return [];

  let candidates = sourceCategory.tickers.filter(
    t => t.toUpperCase() !== oldTicker.toUpperCase()
  );

  if (excludeTickers) {
    candidates = candidates.filter(t => !excludeTickers.has(t.toUpperCase()));
  }

  if (ethicsEnabled) {
    candidates = candidates.filter(t => !isEthicsViolation(t));
  }

  // Apply strategy-based sorting (simplified ranking)
  candidates = sortByStrategy(candidates, strategy, s);

  return candidates.slice(0, 3);
}

// ── Helpers ──────────────────────────────────────────────────────────

function findCategoryForTicker(ticker: string, sheet: SheetData): string | null {
  for (const [key, cat] of Object.entries(sheet.categories)) {
    if (cat.tickers.some(t => t.toUpperCase() === ticker.toUpperCase())) {
      return cat.name;
    }
  }
  return null;
}

function isEthicsViolation(ticker: string): boolean {
  // Simplified: known problematic tickers
  const violations = new Set(['ZM', 'INTC']);
  return violations.has(ticker.toUpperCase());
}

function sortByStrategy(candidates: string[], strategy: string, sheet: SheetData): string[] {
  // Simplified strategy sorting - in production would use real metrics
  const strategyDef = sheet.replacement_strategies[strategy];
  if (!strategyDef) return candidates;

  const steps = strategyDef.steps;

  // Shuffle slightly to simulate ranking (deterministic)
  const seed = strategy.length;
  const shuffled = [...candidates].sort((a, b) => {
    const hashA = hashString(a + steps.join('')) + seed;
    const hashB = hashString(b + steps.join('')) + seed;
    return hashA - hashB;
  });

  return shuffled;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeWeights(holdings: SheetHolding[], maxPerStock: number): SheetHolding[] {
  const total = holdings.reduce((sum, h) => sum + h.percentage, 0);
  if (total === 0) return holdings;

  const normalized = holdings.map(h => ({
    ...h,
    percentage: Math.min(parseFloat(((h.percentage / total) * 100).toFixed(2)), maxPerStock),
  }));

  const currentTotal = normalized.reduce((sum, h) => sum + h.percentage, 0);
  const diff = parseFloat((100 - currentTotal).toFixed(2));

  if (diff !== 0 && normalized.length > 0) {
    const largestIdx = normalized.reduce((maxIdx, h, i, arr) =>
      h.percentage > arr[maxIdx].percentage ? i : maxIdx, 0);
    normalized[largestIdx].percentage = parseFloat(
      (normalized[largestIdx].percentage + diff).toFixed(2)
    );
  }

  return normalized;
}

// ── Exports for compatibility ───────────────────────────────────────

export function getInvestorIdsFromSheet(): string[] {
  const sheet = loadSheet();
  const investors = Object.keys(sheet.investors);
  const congress = Object.keys(sheet.congress).map(id => `congress:${id}`);
  return [...investors, ...congress];
}

export function getInvestorNameFromSheet(investorId: string): string {
  const sheet = loadSheet();
  const isCongress = investorId.startsWith('congress:');
  const cleanId = isCongress ? investorId.replace('congress:', '') : investorId;

  if (isCongress) {
    return sheet.congress[cleanId]?.name || 'Unknown Trader';
  }
  return sheet.investors[cleanId]?.name || 'Unknown Investor';
}

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface StockUniverseEntry {
  ticker: string;
  name: string;
  sector: string;
  styles: string[];
}

export interface InvestorProfile {
  name: string;
  style: string;
  description: string;
  sectorTargets: Record<string, number>;
  criteria: {
    peMax: number;
    pbMax: number;
    roeMin: number;
    debtToEquityMax: number;
    dividendPreferred: boolean;
    marketCapMin: string;
  };
  coreHoldings: string[];
  excludeSectors: string[];
  preferredStyles: string[];
}

export interface CongressTrader {
  name: string;
  party: string;
  description: string;
  holdings: string[];
  topSectors: string[];
  style: string;
  riskLevel: string;
}

let universeCache: StockUniverseEntry[] | null = null;
let profileCache: Record<string, InvestorProfile> | null = null;
let congressCache: Record<string, CongressTrader> | null = null;

function dataPath(filename: string): string {
  return path.join(process.cwd(), 'data', filename);
}

export function loadStockUniverse(): StockUniverseEntry[] {
  if (universeCache) return universeCache;
  try {
    const raw = fs.readFileSync(dataPath('stock_universe.json'), 'utf8');
    const data = JSON.parse(raw);
    const stocks: StockUniverseEntry[] = data.stocks || [];
    universeCache = stocks;
    logger.info('Stock universe loaded', { count: stocks.length });
    return stocks;
  } catch (err) {
    logger.error('Failed to load stock universe', { error: (err as Error).message });
    return [];
  }
}

export function loadInvestorProfiles(): Record<string, InvestorProfile> {
  if (profileCache) return profileCache;
  try {
    const raw = fs.readFileSync(dataPath('investor_profiles.json'), 'utf8');
    const data = JSON.parse(raw);
    const profiles: Record<string, InvestorProfile> = data.profiles || {};
    profileCache = profiles;
    logger.info('Investor profiles loaded', { count: Object.keys(profiles).length });
    return profiles;
  } catch (err) {
    logger.error('Failed to load investor profiles', { error: (err as Error).message });
    return {};
  }
}

export function loadCongressTraders(): Record<string, CongressTrader> {
  if (congressCache) return congressCache;
  try {
    const raw = fs.readFileSync(dataPath('congress_traders.json'), 'utf8');
    const data = JSON.parse(raw);
    const traders: Record<string, CongressTrader> = data.traders || {};
    congressCache = traders;
    logger.info('Congress traders loaded', { count: Object.keys(traders).length });
    return traders;
  } catch (err) {
    logger.error('Failed to load congress traders', { error: (err as Error).message });
    return {};
  }
}

export function getStockByTicker(ticker: string): StockUniverseEntry | undefined {
  const universe = loadStockUniverse();
  return universe.find(s => s.ticker === ticker.toUpperCase());
}

export function getStocksBySector(sector: string): StockUniverseEntry[] {
  const universe = loadStockUniverse();
  return universe.filter(s => s.sector.toLowerCase() === sector.toLowerCase());
}

export function getStocksByStyle(style: string): StockUniverseEntry[] {
  const universe = loadStockUniverse();
  return universe.filter(s => s.styles.map(x => x.toLowerCase()).includes(style.toLowerCase()));
}

export function getSectors(): string[] {
  const universe = loadStockUniverse();
  return [...new Set(universe.map(s => s.sector))];
}

export function getStyles(): string[] {
  const universe = loadStockUniverse();
  const all = universe.flatMap(s => s.styles);
  return [...new Set(all)];
}

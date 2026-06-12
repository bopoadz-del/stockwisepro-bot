import { fmp } from '../api/fmp';
import { getHistoricalPrices } from '../api/yahoo';
import { loadStockUniverse } from './universe';
import { logger } from '../utils/logger';

export interface BacktestResult {
  ticker: string;
  selected: boolean;
  priceThen: number | null;
  priceNow: number | null;
  return6m: number | null;
  metrics: Record<string, number>;
}

export interface BacktestSummary {
  formula: string;
  totalTested: number;
  selectedCount: number;
  selectedReturn: number | null;
  marketReturn: number | null;
  avgReturn: number | null;
  winners: number;
  losers: number;
  results: BacktestResult[];
}

const SAMPLE_TICKERS = 30;

function tokenize(formula: string): string[] {
  return formula
    .toLowerCase()
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function parseExpression(tokens: string[]): (metrics: Record<string, number>) => boolean {
  let i = 0;

  function parseOr(): (metrics: Record<string, number>) => boolean {
    let left = parseAnd();
    while (i < tokens.length && tokens[i] === 'or') {
      i++;
      const right = parseAnd();
      const l = left;
      const r = right;
      left = (m) => l(m) || r(m);
    }
    return left;
  }

  function parseAnd(): (metrics: Record<string, number>) => boolean {
    let left = parseComparison();
    while (i < tokens.length && tokens[i] === 'and') {
      i++;
      const right = parseComparison();
      const l = left;
      const r = right;
      left = (m) => l(m) && r(m);
    }
    return left;
  }

  function parseComparison(): (metrics: Record<string, number>) => boolean {
    if (tokens[i] === '(') {
      i++;
      const expr = parseOr();
      if (tokens[i] === ')') i++;
      return expr;
    }

    const varName = tokens[i++];
    if (!varName) return () => false;

    const op = tokens[i++];
    if (!op) return () => false;

    const valueToken = tokens[i++];
    if (!valueToken) return () => false;
    const value = parseFloat(valueToken);
    if (Number.isNaN(value)) return () => false;

    return (m) => {
      const leftVal = m[varName];
      if (leftVal === undefined || Number.isNaN(leftVal)) return false;
      switch (op) {
        case '<': return leftVal < value;
        case '<=': return leftVal <= value;
        case '>': return leftVal > value;
        case '>=': return leftVal >= value;
        case '==': return leftVal === value;
        case '!=': return leftVal !== value;
        case '=': return leftVal === value;
        default: return false;
      }
    };
  }

  return parseOr();
}

export function buildFormulaEvaluator(formula: string): (metrics: Record<string, number>) => boolean {
  const tokens = tokenize(formula);
  return parseExpression(tokens);
}

async function fetchMetrics(ticker: string): Promise<Record<string, number> | null> {
  try {
    const [quote, metrics, hist] = await Promise.all([
      fmp.getQuote(ticker),
      fmp.getKeyMetrics(ticker),
      getHistoricalPrices(ticker, '1y').catch(() => ({ data: [], error: null })),
    ]);

    const priceNow = quote?.price ?? hist.data?.[hist.data.length - 1]?.close ?? 0;
    if (!priceNow) return null;

    return {
      pe_ratio: metrics?.peRatio ?? quote?.pe ?? 1000,
      pb_ratio: metrics?.pbRatio ?? 10,
      ps_ratio: metrics?.priceToSalesRatio ?? 10,
      roe: metrics?.roe ?? 0,
      roa: metrics?.returnOnAssets ?? 0,
      debt_to_equity: metrics?.debtToEquity ?? 1,
      current_ratio: metrics?.currentRatio ?? 1,
      dividend_yield: metrics?.dividendYield ?? 0,
      revenue_growth: metrics?.revenueGrowth ?? 0,
      earnings_growth: metrics?.netIncomeGrowth ?? 0,
      market_cap: metrics?.marketCap ?? quote?.marketCap ?? 0,
      price: priceNow,
    };
  } catch (err) {
    logger.warn('Backtest fetch metrics failed', { ticker, error: String(err) });
    return null;
  }
}

export async function runBacktest(formula: string, tickers?: string[]): Promise<BacktestSummary> {
  const universe = loadStockUniverse();
  const sample = tickers && tickers.length > 0
    ? tickers.slice(0, SAMPLE_TICKERS)
    : universe.map((s) => s.ticker).slice(0, SAMPLE_TICKERS);

  const evaluator = buildFormulaEvaluator(formula);
  const results: BacktestResult[] = [];

  // Market benchmark: SPY 6M return
  const spyHist = await getHistoricalPrices('SPY', '1y').catch(() => ({ data: [], error: null }));
  const spyPrices = spyHist.data || [];
  const spyNow = spyPrices[spyPrices.length - 1]?.close ?? 0;
  const spyThen = spyPrices[Math.max(0, spyPrices.length - 126)]?.close ?? 0;
  const marketReturn = spyNow && spyThen ? (spyNow - spyThen) / spyThen : null;

  for (const ticker of sample) {
    try {
      const metrics = await fetchMetrics(ticker);
      if (!metrics) {
        results.push({ ticker, selected: false, priceThen: null, priceNow: null, return6m: null, metrics: {} });
        continue;
      }

      const selected = evaluator(metrics);

      let priceThen: number | null = null;
      let priceNow: number | null = metrics.price;
      let return6m: number | null = null;

      if (selected) {
        const hist = await getHistoricalPrices(ticker, '1y').catch(() => ({ data: [], error: null }));
        const prices = hist.data || [];
        priceNow = prices[prices.length - 1]?.close ?? metrics.price;
        priceThen = prices[Math.max(0, prices.length - 126)]?.close ?? null;
        if (priceThen && priceNow) {
          return6m = (priceNow - priceThen) / priceThen;
        }
      }

      results.push({ ticker, selected, priceThen, priceNow, return6m, metrics });
    } catch (err) {
      logger.warn('Backtest ticker failed', { ticker, error: String(err) });
      results.push({ ticker, selected: false, priceThen: null, priceNow: null, return6m: null, metrics: {} });
    }
  }

  const selectedResults = results.filter((r) => r.selected && r.return6m !== null);
  const selectedReturn = selectedResults.length > 0
    ? selectedResults.reduce((sum, r) => sum + r.return6m!, 0) / selectedResults.length
    : null;

  const allReturns = results.filter((r) => r.return6m !== null).map((r) => r.return6m!);
  const avgReturn = allReturns.length > 0
    ? allReturns.reduce((sum, r) => sum + r, 0) / allReturns.length
    : null;

  return {
    formula,
    totalTested: results.length,
    selectedCount: selectedResults.length,
    selectedReturn,
    marketReturn,
    avgReturn,
    winners: selectedResults.filter((r) => r.return6m! > 0).length,
    losers: selectedResults.filter((r) => r.return6m! < 0).length,
    results,
  };
}

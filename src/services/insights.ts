import {
  getScoreHistorySeries,
  getScoreHistoryForTicker,
  getScoreHistoryOverview,
  getAlertCountsByTicker,
  getRecentMarketAlertsForTicker,
  type ScoreSeriesRow,
} from '../db';

/**
 * Phase 4 (v1): deterministic analytics over the recorded score_history /
 * market_alerts dataset. This is the foundation for RAG/ML — it extracts the
 * features and evaluates the core question "does our score predict the next
 * move?" without any external model. An LLM generation layer can later consume
 * the same per-ticker context pack.
 */

export interface SignalAccuracy {
  evaluated: number;
  hits: number;
  hitRate: number | null; // 0..1, null when nothing evaluable
}

export interface TickerInsight {
  ticker: string;
  name: string | null;
  samples: number;
  latest: { score: number | null; signal: string | null; price: number | null; changePct: number | null; at: string } | null;
  scoreMin: number | null;
  scoreMax: number | null;
  scoreAvg: number | null;
  scoreTrend: number | null; // latest score - earliest score in window
  accuracy: SignalAccuracy;
  recentAlerts: Array<{ severity: string; direction: string; changePct: number; headline: string | null; at: string }>;
}

export interface MarketInsights {
  dataset: { snapshots: number; tickers: number; since: string | null };
  accuracy: SignalAccuracy;
  topGainers: Array<{ ticker: string; trend: number }>;
  topLosers: Array<{ ticker: string; trend: number }>;
  mostAlerted: Array<{ ticker: string; count: number }>;
}

// Map a score to a directional prediction; mid-band scores make no call.
function predictedDirection(score: number | null): 'up' | 'down' | null {
  if (score == null) return null;
  if (score >= 70) return 'up';
  if (score < 45) return 'down';
  return null;
}

function actualDirection(from: number | null, to: number | null): 'up' | 'down' | 'flat' | null {
  if (from == null || to == null) return null;
  if (to > from) return 'up';
  if (to < from) return 'down';
  return 'flat';
}

// Evaluate score→next-move accuracy over a single ticker's time-ordered series.
function evaluateSeries(rows: ScoreSeriesRow[], acc: { evaluated: number; hits: number }) {
  for (let i = 0; i < rows.length - 1; i++) {
    const pred = predictedDirection(rows[i].score);
    if (!pred) continue;
    const actual = actualDirection(rows[i].price, rows[i + 1].price);
    if (!actual || actual === 'flat') continue;
    acc.evaluated++;
    if (pred === actual) acc.hits++;
  }
}

function rate(evaluated: number, hits: number): number | null {
  return evaluated > 0 ? hits / evaluated : null;
}

export function computeMarketInsights(): MarketInsights {
  const overview = getScoreHistoryOverview();
  const series = getScoreHistorySeries(8000);

  // Group by ticker, preserving the global time order within each group.
  const byTicker = new Map<string, ScoreSeriesRow[]>();
  for (const row of series) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  const acc = { evaluated: 0, hits: 0 };
  const trends: Array<{ ticker: string; trend: number }> = [];
  for (const [ticker, rows] of byTicker) {
    evaluateSeries(rows, acc);
    const withScore = rows.filter(r => r.score != null);
    if (withScore.length >= 2) {
      const trend = (withScore[withScore.length - 1].score as number) - (withScore[0].score as number);
      if (trend !== 0) trends.push({ ticker, trend });
    }
  }

  trends.sort((a, b) => b.trend - a.trend);
  const topGainers = trends.filter(t => t.trend > 0).slice(0, 5);
  const topLosers = trends.filter(t => t.trend < 0).slice(-5).reverse();

  return {
    dataset: { snapshots: overview.total, tickers: overview.tickers, since: overview.since },
    accuracy: { evaluated: acc.evaluated, hits: acc.hits, hitRate: rate(acc.evaluated, acc.hits) },
    topGainers,
    topLosers,
    mostAlerted: getAlertCountsByTicker(5),
  };
}

export function computeTickerInsight(ticker: string): TickerInsight | null {
  const rows = getScoreHistoryForTicker(ticker, 1000);
  if (rows.length === 0) return null;

  const scores = rows.map(r => r.score).filter((s): s is number => s != null);
  const acc = { evaluated: 0, hits: 0 };
  evaluateSeries(rows, acc);

  const last = rows[rows.length - 1];
  const scoreTrend = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : null;

  return {
    ticker: ticker.toUpperCase(),
    name: last.name,
    samples: rows.length,
    latest: { score: last.score, signal: last.signal, price: last.price, changePct: last.change_pct, at: last.created_at },
    scoreMin: scores.length ? Math.min(...scores) : null,
    scoreMax: scores.length ? Math.max(...scores) : null,
    scoreAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    scoreTrend,
    accuracy: { evaluated: acc.evaluated, hits: acc.hits, hitRate: rate(acc.evaluated, acc.hits) },
    recentAlerts: getRecentMarketAlertsForTicker(ticker, 3).map(a => ({
      severity: a.severity,
      direction: a.direction,
      changePct: a.change_pct,
      headline: a.headline,
      at: a.created_at,
    })),
  };
}

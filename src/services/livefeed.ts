import cron from 'node-cron';
import { fmp } from '../api/fmp';
import { getYahooQuote } from '../api/yahoo';
import { computeOpenBoxScore } from './openbox/engine';
import { loadStockUniverse } from './universe';
import { brave } from '../api/brave';
import { recordScoreSnapshot, recordMarketAlert, getRecentMarketAlerts } from '../db';
import { logger } from '../utils/logger';

/**
 * Live score feed: every minute it rotates to a new S&P-500-class ticker,
 * computes its OpenBox score + live quote, records the snapshot to
 * score_history (the dataset that seeds future RAG/ML work), and raises a
 * market alert when the price move crosses a severity threshold.
 */

export type AlertSeverity = 'notable' | 'big' | 'extreme';

export interface LiveSnapshot {
  ticker: string;
  name: string | null;
  sector: string | null;
  score: number | null;
  signal: 'buy' | 'hold' | 'sell' | null;
  price: number | null;
  changePct: number | null;
  pillars: Record<string, number> | null;
  updatedAt: string;
}

export interface LiveAlert {
  ticker: string;
  name: string | null;
  severity: AlertSeverity;
  direction: 'up' | 'down';
  changePct: number;
  price: number | null;
  score: number | null;
  headline: string | null;
  headlineUrl: string | null;
  createdAt: string;
}

// Absolute % price-move thresholds for each severity tier.
const THRESHOLD = { notable: 3, big: 6, extreme: 10 };

const FALLBACK_UNIVERSE = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

let universe: string[] = [];
let cursor = 0;
let latestSnapshot: LiveSnapshot | null = null;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildUniverse(): string[] {
  try {
    const tickers = loadStockUniverse().map(s => s.ticker).filter(Boolean);
    return tickers.length ? shuffle(tickers) : [...FALLBACK_UNIVERSE];
  } catch {
    return [...FALLBACK_UNIVERSE];
  }
}

async function fetchQuote(sym: string): Promise<any | null> {
  const q = await fmp.getQuote(sym).catch(() => null);
  if (q) return q;
  const yq = await getYahooQuote(sym).catch(() => null);
  if (yq) {
    return {
      symbol: yq.symbol,
      name: yq.name,
      price: yq.price,
      change: yq.change,
      changesPercentage: yq.changesPercentage,
    };
  }
  return null;
}

function severityFor(absPct: number): AlertSeverity | null {
  if (absPct >= THRESHOLD.extreme) return 'extreme';
  if (absPct >= THRESHOLD.big) return 'big';
  if (absPct >= THRESHOLD.notable) return 'notable';
  return null;
}

async function processTicker(ticker: string): Promise<void> {
  const [quote, scoreResult] = await Promise.all([
    fetchQuote(ticker),
    computeOpenBoxScore(ticker).catch(() => null),
  ]);
  if (!quote && !scoreResult) return;

  const score = scoreResult?.finalScore ?? null;
  const signal: LiveSnapshot['signal'] =
    score == null ? null : score >= 70 ? 'buy' : score >= 45 ? 'hold' : 'sell';
  const changePct = typeof quote?.changesPercentage === 'number' ? quote.changesPercentage : null;
  const price = typeof quote?.price === 'number' ? quote.price : null;
  const pillars = scoreResult?.pillars ?? null;

  const snap: LiveSnapshot = {
    ticker: ticker.toUpperCase(),
    name: quote?.name ?? null,
    sector: scoreResult?.sector ?? null,
    score,
    signal,
    price,
    changePct,
    pillars,
    updatedAt: new Date().toISOString(),
  };
  latestSnapshot = snap;

  recordScoreSnapshot({
    ticker: snap.ticker,
    name: snap.name,
    sector: snap.sector,
    score,
    signal,
    price,
    changePct,
    pillars,
  });

  // Anomaly detection → market alert (enriched with a headline for big moves).
  if (changePct != null) {
    const severity = severityFor(Math.abs(changePct));
    if (severity) {
      const direction: 'up' | 'down' = changePct >= 0 ? 'up' : 'down';
      let headline: string | null = null;
      let headlineUrl: string | null = null;
      if (severity === 'big' || severity === 'extreme') {
        try {
          const news = await brave.newsSearch(`${ticker} stock`, 1);
          const first = news?.data?.[0];
          if (first) {
            headline = first.title || null;
            headlineUrl = first.url || null;
          }
        } catch {
          /* headline is best-effort */
        }
      }
      recordMarketAlert({
        ticker: snap.ticker,
        name: snap.name,
        severity,
        direction,
        changePct,
        price,
        score,
        headline,
        headlineUrl,
      });
      logger.info('Market alert', { ticker: snap.ticker, severity, changePct });
    }
  }
}

export function getLatestSnapshot(): LiveSnapshot | null {
  return latestSnapshot;
}

export function getLiveAlerts(limit = 8): LiveAlert[] {
  return getRecentMarketAlerts(limit).map(r => ({
    ticker: r.ticker,
    name: r.name,
    severity: r.severity as AlertSeverity,
    direction: r.direction === 'down' ? 'down' : 'up',
    changePct: r.change_pct,
    price: r.price,
    score: r.score,
    headline: r.headline,
    headlineUrl: r.headline_url,
    createdAt: r.created_at,
  }));
}

export function startLiveFeedService() {
  universe = buildUniverse();
  // Prime immediately so the live card has data on first page load.
  processTicker('AAPL').catch(err => logger.warn('Live feed prime failed', { error: String(err) }));

  const task = cron.schedule('* * * * *', async () => {
    if (universe.length === 0) universe = buildUniverse();
    const ticker = universe[cursor % universe.length];
    cursor = (cursor + 1) % universe.length;
    try {
      await processTicker(ticker);
    } catch (err) {
      logger.warn('Live feed tick failed', { ticker, error: String(err) });
    }
  });

  logger.info('Live feed service started (1-min rotation)', { universeSize: universe.length });
  return task;
}

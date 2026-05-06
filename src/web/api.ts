import { Router, Request, Response } from 'express';
import multer from 'multer';
import { fmp } from '../api/fmp';
import { yahooSearch, getYahooQuote } from '../api/yahoo';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { getLocalMimicAllocation, fetchMimicPrices } from '../services/mimic';
import { getStockByTicker } from '../services/universe';
import { logger } from '../utils/logger';
import {
  createWebUser,
  findWebUserByEmail,
  getWebWatchlist,
  addWebWatchlistItem,
  removeWebWatchlistItem,
  getWebAlerts,
  addWebAlert,
  removeWebAlert,
} from '../db';
import { runOCR, scoreTickers, makeTmpPath, cleanupFile } from '../services/ocr';
import { hashPassword, comparePassword, authMiddleware, WebAuthRequest } from './auth';
import fs from 'fs';
import path from 'path';

const router = Router();

/* ─── Screener score cache ──────────────────────────────────────────────── */
interface ScreenerScoreEntry {
  score: number;
  signal: 'buy' | 'hold' | 'sell';
  sector?: string;
  industry?: string;
  timestamp: number;
}
const screenerScoreCache = new Map<string, ScreenerScoreEntry>();
const SCORE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getScreenerScore(ticker: string): Promise<ScreenerScoreEntry | null> {
  const cached = screenerScoreCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < SCORE_CACHE_TTL_MS) {
    return cached;
  }
  try {
    const result = await computeOpenBoxScore(ticker);
    if (!result) return null;
    const signal = result.finalScore >= 70 ? 'buy' : result.finalScore >= 45 ? 'hold' : 'sell';
    const entry: ScreenerScoreEntry = {
      score: result.finalScore,
      signal,
      sector: result.sector,
      industry: result.industry,
      timestamp: Date.now(),
    };
    screenerScoreCache.set(ticker, entry);
    return entry;
  } catch (err) {
    logger.warn('Screener score compute failed', { ticker, error: String(err) });
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return results;
}

/* ─── Multer upload config ─── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images allowed'));
    }
  },
});

// Helper to type authenticated requests after authMiddleware
function withAuth(handler: (req: WebAuthRequest, res: Response) => void | Promise<void>) {
  return (req: Request, res: Response) => handler(req as WebAuthRequest, res);
}

/* ─── Auth ─── */

router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = findWebUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hash = await hashPassword(password);
    const user = createWebUser(email, hash, name);
    if (!user) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

    const session = (req as any).session;
    session.userId = user.id;
    session.webUser = { id: user.id, email: user.email, name: user.name };

    res.status(201).json({
      message: 'Registered successfully',
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    logger.error('Register error', { error: String(err) });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = findWebUserByEmail(email);
    if (!user || !(await comparePassword(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const session = (req as any).session;
    session.userId = user.id;
    session.webUser = { id: user.id, email: user.email, name: user.name };

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    logger.error('Login error', { error: String(err) });
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req: Request, res: Response) => {
  const session = (req as any).session;
  if (session) {
    session.destroy(() => {});
  }
  res.json({ message: 'Logged out' });
});

router.get('/auth/me', (req: Request, res: Response) => {
  const session = (req as any).session;
  if (session && session.userId && session.webUser) {
    res.json({ user: session.webUser });
  } else {
    res.json({ user: null });
  }
});

/* ─── Stocks ─── */

router.get('/stocks/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '');
    if (!q || q.length < 1) {
      res.status(400).json({ error: 'Query required' });
      return;
    }
    // Try FMP first
    const results = await fmp.searchSymbols(q, 10);
    if (results && results.length > 0) {
      res.json(results.map(r => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchangeShortName || r.stockExchange,
      })));
      return;
    }
    // Fallback to Yahoo search
    const yahoo = await yahooSearch(q);
    if (yahoo.data && yahoo.data.length > 0) {
      res.json(yahoo.data.map((r: any) => ({
        symbol: r.symbol,
        name: r.shortname || r.longname || r.symbol,
        exchange: r.exchange,
      })));
      return;
    }
    res.json([]);
  } catch (err) {
    logger.error('Stock search error', { error: String(err) });
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/stocks/quote/:ticker', async (req: Request, res: Response) => {
  try {
    const ticker = String(req.params.ticker).toUpperCase();
    let quote = await fmp.getQuote(ticker);
    // Fallback to Yahoo Finance when FMP fails
    if (!quote) {
      const yq = await getYahooQuote(ticker);
      if (yq) {
        quote = {
          symbol: yq.symbol,
          name: yq.name,
          price: yq.price,
          change: yq.change,
          changesPercentage: yq.changesPercentage,
          marketCap: yq.marketCap || 0,
          pe: yq.pe || 0,
          volume: yq.volume || 0,
          avgVolume: yq.avgVolume || 0,
          dayLow: yq.dayLow || 0,
          dayHigh: yq.dayHigh || 0,
          yearLow: yq.yearLow || 0,
          yearHigh: yq.yearHigh || 0,
          eps: yq.eps || 0,
        } as any;
      }
    }

    const [scoreResult, metrics] = await Promise.all([
      computeOpenBoxScore(ticker).catch(() => null),
      fmp.getKeyMetrics(ticker).catch(() => null),
    ]);

    if (!quote) {
      res.status(404).json({ error: 'Stock not found' });
      return;
    }

    const signal = scoreResult
      ? scoreResult.finalScore >= 70 ? 'buy' : scoreResult.finalScore >= 45 ? 'hold' : 'sell'
      : 'hold';

    res.json({
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changesPercentage: quote.changesPercentage,
      marketCap: quote.marketCap,
      pe: quote.pe,
      volume: quote.volume,
      avgVolume: quote.avgVolume,
      dayLow: quote.dayLow,
      dayHigh: quote.dayHigh,
      yearLow: quote.yearLow,
      yearHigh: quote.yearHigh,
      eps: quote.eps,
      score: scoreResult?.finalScore ?? null,
      signal,
      metrics: metrics ? {
        peRatio: metrics.peRatio,
        priceToBookRatio: metrics.priceToBookRatio,
        priceToSalesRatio: metrics.priceToSalesRatio,
        roe: metrics.roe,
        roa: metrics.returnOnAssets,
        debtToEquity: metrics.debtToEquity,
        currentRatio: metrics.currentRatio,
        dividendYield: metrics.dividendYield,
      } : null,
    });
  } catch (err) {
    logger.error('Quote error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Helper: fetch quote with FMP -> Yahoo fallback
async function fetchQuoteWithFallback(sym: string): Promise<any | null> {
  const quote = await fmp.getQuote(sym);
  if (quote) return quote;
  const yq = await getYahooQuote(sym);
  if (yq) {
    return {
      symbol: yq.symbol,
      name: yq.name,
      price: yq.price,
      change: yq.change,
      changesPercentage: yq.changesPercentage,
      marketCap: yq.marketCap || 0,
      pe: yq.pe || 0,
      volume: yq.volume || 0,
      avgVolume: yq.avgVolume || 0,
    };
  }
  return null;
}

router.get('/stocks/quotes', async (req: Request, res: Response) => {
  try {
    const symbols = String(req.query.symbols || '').split(',').filter(Boolean);
    if (symbols.length === 0 || symbols.length > 20) {
      res.status(400).json({ error: 'Provide 1–20 symbols' });
      return;
    }
    const results = (await Promise.all(
      symbols.map(sym => fetchQuoteWithFallback(sym))
    )).filter(Boolean);
    res.json(results);
  } catch (err) {
    logger.error('Batch quotes error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

router.get('/stocks/metrics/:ticker', async (req: Request, res: Response) => {
  try {
    const ticker = String(req.params.ticker).toUpperCase();
    const metrics = await fmp.getKeyMetrics(ticker);
    if (!metrics) {
      res.status(404).json({ error: 'Metrics not found' });
      return;
    }
    res.json({
      peRatio: metrics.peRatio,
      priceToBookRatio: metrics.priceToBookRatio,
      priceToSalesRatio: metrics.priceToSalesRatio,
      roe: metrics.roe,
      roa: metrics.returnOnAssets,
      debtToEquity: metrics.debtToEquity,
      currentRatio: metrics.currentRatio,
      quickRatio: metrics.currentRatio, // fallback
      dividendYield: metrics.dividendYield,
    });
  } catch (err) {
    logger.error('Metrics error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/stocks/trending', async (_req: Request, res: Response) => {
  try {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK-B', 'JPM', 'V'];
    const results = (await Promise.all(
      symbols.map(sym => fetchQuoteWithFallback(sym))
    )).filter(Boolean);
    res.json(results);
  } catch (err) {
    logger.error('Trending error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch trending' });
  }
});

router.get('/stocks/screener', async (_req: Request, res: Response) => {
  try {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK-B', 'JPM', 'V', 'WMT', 'UNH', 'PG', 'HD', 'MA', 'BAC', 'ABBV', 'PFE', 'KO', 'AVGO'];
    const quotes = (await Promise.all(
      symbols.map(sym => fetchQuoteWithFallback(sym))
    )).filter(Boolean);

    // Compute OpenBox scores with limited concurrency to avoid Yahoo 429s
    const scoreEntries = await mapWithConcurrency(
      quotes.map(q => q.symbol as string),
      4,
      getScreenerScore
    );

    const results = quotes.map((quote, i) => {
      const scoreEntry = scoreEntries[i];
      return {
        ...quote,
        score: scoreEntry?.score ?? null,
        signal: scoreEntry?.signal ?? 'hold',
        sector: scoreEntry?.sector ?? null,
      };
    });

    res.json(results);
  } catch (err) {
    logger.error('Screener error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch screener' });
  }
});

router.get('/stocks/indices', async (_req: Request, res: Response) => {
  try {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM'];
    const results = (await Promise.all(
      indices.map(sym => fetchQuoteWithFallback(sym))
    )).filter(Boolean);
    res.json(results.map((q: any) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      change: q.change,
      changesPercentage: q.changesPercentage,
    })));
  } catch (err) {
    logger.error('Indices error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch indices' });
  }
});

/* ─── Investors ─── */

const INVESTOR_PROFILES_PATH = path.join(__dirname, '../../data/investor_profiles.json');

function loadInvestorProfiles(): any {
  try {
    const raw = fs.readFileSync(INVESTOR_PROFILES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { profiles: {} };
  }
}

router.get('/investors', (_req: Request, res: Response) => {
  try {
    const data = loadInvestorProfiles();
    const profiles = data.profiles || {};
    const investors = Object.entries(profiles).map(([id, p]: [string, any]) => {
      const coreHoldings = (p.coreHoldings || []).map((ticker: string) => {
        const stock = getStockByTicker(ticker);
        return { ticker, name: stock?.name || ticker, allocation: stock ? undefined : undefined };
      });
      return {
        id,
        name: p.name,
        style: p.style,
        description: p.description,
        sectorTargets: p.sectorTargets,
        criteria: p.criteria,
        coreHoldings,
      };
    });
    res.json(investors);
  } catch (err) {
    logger.error('Investors error', { error: String(err) });
    res.status(500).json({ error: 'Failed to load investors' });
  }
});

/* ─── Portfolio Mimic ─── */

router.post('/portfolio/mimic', async (req: Request, res: Response) => {
  try {
    const { investorId, budget, ethicsEnabled } = req.body;
    if (!investorId || typeof investorId !== 'string') {
      res.status(400).json({ error: 'investorId required' });
      return;
    }
    const bgt = typeof budget === 'number' && budget > 0 ? budget : 10000;

    const allocation = getLocalMimicAllocation(investorId, !!ethicsEnabled);
    if (!allocation) {
      res.status(400).json({ error: 'Unknown investor' });
      return;
    }

    // Fetch current prices for holdings
    const prices = await fetchMimicPrices(allocation.holdings);

    const holdings = allocation.holdings.map(h => {
      const price = prices.get(h.ticker) || 100;
      const budgetAllocation = bgt * (h.percentage / 100);
      const shares = Math.floor(budgetAllocation / price);
      const stock = getStockByTicker(h.ticker);
      return {
        ticker: h.ticker,
        name: stock?.name || h.ticker,
        allocation: h.percentage,
        price,
        shares,
        value: shares * price,
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const cashRemaining = bgt - totalValue;

    res.json({
      investor: investorId,
      investorName: allocation.investorName,
      budget: bgt,
      holdings,
      totalValue,
      cashRemaining,
      ethicsApplied: allocation.ethicsApplied,
      replacedTickers: allocation.replacedTickers || [],
    });
  } catch (err) {
    logger.error('Mimic error', { error: String(err) });
    res.status(500).json({ error: 'Failed to build portfolio' });
  }
});

/* ─── Watchlist (auth required) ─── */

router.get('/watchlist', authMiddleware, withAuth((req, res) => {
  try {
    const items = getWebWatchlist(req.webUser!.id);
    res.json(items.map(i => ({ ticker: i.ticker, addedAt: i.added_at })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
}));

router.post('/watchlist', authMiddleware, withAuth((req, res) => {
  try {
    const { ticker, name } = req.body;
    if (!ticker || typeof ticker !== 'string') {
      res.status(400).json({ error: 'Ticker required' });
      return;
    }
    addWebWatchlistItem(req.webUser!.id, ticker);
    res.status(201).json({ ticker: ticker.toUpperCase(), name: name || ticker.toUpperCase() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add watchlist item' });
  }
}));

router.delete('/watchlist/:ticker', authMiddleware, withAuth((req, res) => {
  try {
    removeWebWatchlistItem(req.webUser!.id, String(req.params.ticker));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove watchlist item' });
  }
}));

/* ─── Alerts (auth required) ─── */

router.get('/alerts', authMiddleware, withAuth((req, res) => {
  try {
    const alerts = getWebAlerts(req.webUser!.id);
    res.json(alerts.map(a => ({
      id: a.id,
      ticker: a.ticker,
      targetPrice: a.target_price,
      condition: a.condition,
      isActive: a.is_active === 1,
      createdAt: a.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get alerts' });
  }
}));

router.post('/alerts', authMiddleware, withAuth((req, res) => {
  try {
    const { ticker, targetPrice, condition } = req.body;
    if (!ticker || typeof targetPrice !== 'number' || !condition) {
      res.status(400).json({ error: 'ticker, targetPrice, condition required' });
      return;
    }
    if (!['above', 'below'].includes(condition)) {
      res.status(400).json({ error: 'condition must be above or below' });
      return;
    }
    const result = addWebAlert(req.webUser!.id, ticker, targetPrice, condition);
    res.status(201).json({ id: Number(result.lastInsertRowid), ticker, targetPrice, condition });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
}));

router.delete('/alerts/:id', authMiddleware, withAuth((req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }
    removeWebAlert(req.webUser!.id, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
}));

/* ─── Screenshot OCR ─── */

router.post('/screenshots', upload.single('image'), async (req: Request, res: Response) => {
  let tmpPath = '';
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded' });
      return;
    }

    // Write buffer to temp file for tesseract
    tmpPath = makeTmpPath('web_screenshot');
    fs.writeFileSync(tmpPath, req.file.buffer);

    // Run OCR
    const { tickers, rawText } = await runOCR(tmpPath);

    if (!rawText || rawText.trim().length === 0) {
      res.status(422).json({ error: 'Could not read text from image' });
      return;
    }

    if (tickers.length === 0) {
      res.status(422).json({ error: 'No ticker symbols found' });
      return;
    }

    // Score tickers (no userId for web anonymous use)
    const results = await scoreTickers(tickers);

    res.json({
      tickersFound: tickers.length,
      tickers: results,
    });
  } catch (err) {
    logger.error('Screenshot OCR failed', { error: String(err) });
    res.status(500).json({ error: 'OCR processing failed' });
  } finally {
    cleanupFile(tmpPath);
  }
});

export default router;

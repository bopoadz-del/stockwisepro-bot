import { Router } from 'express';
import { fmp } from '../api/fmp';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { getLocalMimicAllocation, fetchMimicPrices } from '../services/mimic';
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
import { hashPassword, comparePassword, generateToken, authMiddleware } from './auth';
import fs from 'fs';
import path from 'path';

const router = Router();

/* ─── Auth ─── */

router.post('/auth/register', async (req, res) => {
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

    const hash = hashPassword(password);
    const user = createWebUser(email, hash, name);
    if (!user) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

    const token = generateToken(user.id);
    res.status(201).json({
      message: 'Registered successfully',
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    logger.error('Register error', { error: String(err) });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = findWebUserByEmail(email);
    if (!user || !comparePassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.id);
    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    logger.error('Login error', { error: String(err) });
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/auth/me', authMiddleware, (req: any, res) => {
  res.json({ user: req.webUser });
});

/* ─── Stocks ─── */

router.get('/stocks/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    if (!q || q.length < 1) {
      res.status(400).json({ error: 'Query required' });
      return;
    }
    // Search using FMP quote batch — try common US tickers first
    const commonTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JPM', 'V', 'JNJ', 'WMT', 'UNH', 'PG', 'HD', 'MA', 'BAC', 'ABBV', 'PFE', 'KO', 'AVGO', 'PEP', 'LLY', 'COST', 'TMO', 'MRK', 'ABT', 'DIS', 'MCD', 'ACN', 'VZ', 'ADBE', 'CRM', 'WFC', 'NKE', 'TXN', 'BMY', 'PM', 'QCOM', 'RTX'];
    const matches = commonTickers.filter(t => t.toLowerCase().startsWith(q.toLowerCase()));
    const results = [];
    for (const ticker of matches.slice(0, 10)) {
      const quote = await fmp.getQuote(ticker);
      if (quote) {
        results.push({ symbol: quote.symbol, name: quote.name, price: quote.price, change: quote.change, changesPercentage: quote.changesPercentage });
      }
    }
    res.json(results);
  } catch (err) {
    logger.error('Stock search error', { error: String(err) });
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/stocks/quote/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const [quote, scoreResult, metrics] = await Promise.all([
      fmp.getQuote(ticker),
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

router.get('/stocks/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '').split(',').filter(Boolean);
    if (symbols.length === 0 || symbols.length > 20) {
      res.status(400).json({ error: 'Provide 1–20 symbols' });
      return;
    }
    const results = [];
    for (const sym of symbols) {
      const quote = await fmp.getQuote(sym);
      if (quote) {
        results.push({
          symbol: quote.symbol,
          name: quote.name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
          marketCap: quote.marketCap,
          pe: quote.pe,
          volume: quote.volume,
          avgVolume: quote.avgVolume,
        });
      }
      // Small delay to avoid rate limits on free tier
      if (symbols.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    res.json(results);
  } catch (err) {
    logger.error('Batch quotes error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

router.get('/stocks/metrics/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
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

router.get('/stocks/indices', async (_req, res) => {
  try {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM'];
    const results = [];
    for (const sym of indices) {
      const quote = await fmp.getQuote(sym);
      if (quote) {
        results.push({
          symbol: quote.symbol,
          name: quote.name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
        });
      }
    }
    res.json(results);
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

router.get('/investors', (_req, res) => {
  try {
    const data = loadInvestorProfiles();
    const profiles = data.profiles || {};
    const investors = Object.entries(profiles).map(([id, p]: [string, any]) => ({
      id,
      name: p.name,
      style: p.style,
      description: p.description,
      sectorTargets: p.sectorTargets,
      criteria: p.criteria,
      coreHoldings: p.coreHoldings || [],
    }));
    res.json(investors);
  } catch (err) {
    logger.error('Investors error', { error: String(err) });
    res.status(500).json({ error: 'Failed to load investors' });
  }
});

/* ─── Portfolio Mimic ─── */

router.post('/portfolio/mimic', async (req, res) => {
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
      return {
        ticker: h.ticker,
        name: h.ticker,
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

router.get('/watchlist', authMiddleware, (req: any, res) => {
  try {
    const items = getWebWatchlist(req.webUser.id);
    res.json(items.map(i => ({ ticker: i.ticker, addedAt: i.added_at })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

router.post('/watchlist', authMiddleware, (req: any, res) => {
  try {
    const { ticker, name } = req.body;
    if (!ticker || typeof ticker !== 'string') {
      res.status(400).json({ error: 'Ticker required' });
      return;
    }
    addWebWatchlistItem(req.webUser.id, ticker);
    res.status(201).json({ ticker: ticker.toUpperCase(), name: name || ticker.toUpperCase() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add watchlist item' });
  }
});

router.delete('/watchlist/:ticker', authMiddleware, (req: any, res) => {
  try {
    removeWebWatchlistItem(req.webUser.id, req.params.ticker);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove watchlist item' });
  }
});

/* ─── Alerts (auth required) ─── */

router.get('/alerts', authMiddleware, (req: any, res) => {
  try {
    const alerts = getWebAlerts(req.webUser.id);
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
});

router.post('/alerts', authMiddleware, (req: any, res) => {
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
    const result = addWebAlert(req.webUser.id, ticker, targetPrice, condition);
    res.status(201).json({ id: Number(result.lastInsertRowid), ticker, targetPrice, condition });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.delete('/alerts/:id', authMiddleware, (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }
    removeWebAlert(req.webUser.id, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;

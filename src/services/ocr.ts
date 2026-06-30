import { createWorker, PSM } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { computeOpenBoxScore } from './openbox/engine';
import { fmp } from '../api/fmp';
import { logger } from '../utils/logger';
import { loadStockUniverse } from './universe';

const TMP_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'tmp') : '/tmp';

// Expanded common words filter + brokerage UI terms
const COMMON_WORDS = new Set([
  'A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR',
  'SO', 'TO', 'UP', 'US', 'WE', 'ALL', 'AND', 'ARE', 'BUT', 'CAN', 'FOR', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOW',
  'ITS', 'NEW', 'NOT', 'NOW', 'OFF', 'OLD', 'ONE', 'OUR', 'OUT', 'SEE', 'SHE', 'THE', 'TWO', 'USE', 'WAY', 'WHO',
  'YES', 'YET', 'YOU', 'THEY', 'THEM', 'THAN', 'THEN', 'THAT', 'THIS', 'WILL', 'WITH', 'HAVE', 'FROM', 'HERE',
  'WANT', 'BEEN', 'WERE', 'SAID', 'EACH', 'WHICH', 'THEIR', 'TIME', 'VERY', 'WHEN', 'MUCH', 'WOULD', 'THERE',
  'ABOUT', 'OTHER', 'RIGHT', 'FIRST', 'ALSO', 'AFTER', 'BACK', 'ONLY', 'KNOW', 'TAKE', 'YEAR', 'GOOD', 'SOME',
  'COME', 'MAKE', 'WELL', 'WORK', 'EVEN', 'MORE', 'LONG', 'WHAT', 'FIND', 'GIVE', 'MOST', 'OVER', 'SUCH', 'THINK',
  'WHERE', 'BEING', 'EVERY', 'GREAT', 'MIGHT', 'SHALL', 'STILL', 'THOSE', 'WHILE', 'COULD', 'STATE', 'NEVER',
  'REALLY', 'SHOULD', 'THROUGH', 'BECAUSE', 'BEFORE', 'LITTLE', 'PEOPLE', 'AROUND', 'DURING', 'PLACE', 'THESE',
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SHARES', 'PRICE', 'TOTAL', 'VALUE', 'CASH', 'DATE', 'TYPE', 'QTY',
  'AMT', 'CHG', 'PCT', 'BUY', 'SELL', 'HOLD', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOL', 'AVG', 'MIN', 'MAX',
  'SUM', 'NET', 'GAIN', 'LOSS', 'PROFIT', 'COST', 'BASIS', 'TAX', 'FEE', 'DIV', 'YIELD', 'INT', 'APR',
  // Brokerage UI words
  'EQUITY', 'BALANCE', 'DEPOSIT', 'WITHDRAW', 'TRANSFER', 'ORDER', 'FILLED', 'PENDING', 'CANCELLED',
  'MARKET', 'LIMIT', 'STOP', 'GTC', 'DAY', 'EXT', 'PRE', 'POST', 'ACCOUNT', 'PORTFOLIO', 'WATCHLIST',
  'POSITION', 'HOLDING', 'TRANSACTION', 'ACTIVITY', 'STATEMENT', 'OVERVIEW', 'DETAILS', 'SETTINGS',
  'HOME', 'MENU', 'BACK', 'NEXT', 'DONE', 'EDIT', 'SAVE', 'DELETE', 'ADD', 'REMOVE', 'UPDATE',
  'BID', 'ASK', 'SPREAD', 'DEPTH', 'LEVEL', 'QUOTE', 'CHART', 'GRAPH', 'LINE', 'CANDLE', 'BAR',
  'MINUTE', 'HOUR', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'YTD', 'MTD', 'CUSTOM', 'RANGE',
  'ROBINHOOD', 'FIDELITY', 'SCHWAB', 'ETRADE', 'TD', 'AMERITRADE', 'WEBULL', 'SOFI', 'PUBLIC',
  'COINBASE', 'BINANCE', 'KRAKEN', 'GEMINI', 'BLOCKFI', 'VANGUARD', 'WEALTHFRONT', 'BETTERMENT',
]);

// Known ETF/stock patterns that are often false positives
const FALSE_POSITIVES = new Set([
  'NYSE', 'NASDAQ', 'AMEX', 'CBOE', 'OTC', 'SPX', 'VIX', 'FX', 'IPO', 'CEO', 'CFO', 'CTO', 'COO',
  'LLC', 'INC', 'CORP', 'LTD', 'PLC', 'AG', 'SA', 'SE', 'BV', 'NV', 'GMBH', 'PTY', 'SDN',
  'SEC', 'FDA', 'IRS', 'EPA', 'FBI', 'CIA', 'NASA', 'NATO', 'UN', 'EU', 'UK', 'USA', 'US',
  'GDP', 'CPI', 'PPI', 'PCE', 'PMI', 'ISM', 'NFP', 'ADP', 'EIA', 'API', 'OPEC', 'FOMC',
  // Months / dates / times
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
  'AM', 'PM', 'ET', 'EST', 'EDT', 'PT', 'PST', 'PDT', 'CT', 'CST', 'CDT',
  // UI / app chrome
  'APP', 'IOS', 'ANDROID', 'WIFI', 'LTE', 'GPS', 'SMS', 'PIN', 'BIO', 'FACE', 'TOUCH', 'ID',
  'OK', 'DONE', 'EDIT', 'SAVE', 'ADD', 'NEW', 'ALL', 'TOP', 'HOT', 'POPULAR', 'TRENDING',
]);

const UNIVERSE = loadStockUniverse();
const VALID_TICKERS = new Set(UNIVERSE.map((s) => s.ticker.toUpperCase()));

function normalizeTickerCandidate(raw: string): string {
  // OCR often misreads characters. Try to clean the candidate.
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '')
    .replace(/^[0-9]+/, '') // leading digits are almost never part of a US ticker
    .replace(/\.+$/, '')
    .slice(0, 6);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatchTicker(candidate: string): string | undefined {
  if (VALID_TICKERS.has(candidate)) return candidate;
  if (candidate.length < 2 || candidate.length > 5) return undefined;

  // Allow one-character OCR error if it maps to a valid ticker
  let best: string | undefined;
  let bestDist = Infinity;
  for (const ticker of VALID_TICKERS) {
    if (Math.abs(ticker.length - candidate.length) > 1) continue;
    const dist = levenshtein(candidate, ticker);
    if (dist < bestDist && dist <= 1) {
      bestDist = dist;
      best = ticker;
    }
  }
  return best;
}

// UI chrome words that can appear directly under a ticker but are NOT company
// names. Used to reject false "ticker-over-name" confirmations (e.g. "US" / "Open").
const UI_NEXT_LINE_WORDS = new Set([
  'open', 'orders', 'positions', 'quantity', 'value', 'last', 'cost', 'price', 'profit',
  'loss', 'symbol', 'markets', 'watchlist', 'trade', 'total', 'balance', 'cash', 'equity',
  'buy', 'sell', 'avgcost', 'mktvalue', 'holdings', 'overview', 'details', 'today',
  'gainers', 'losers', 'change', 'amount', 'shares',
]);

// A line is a ticker candidate if it is a single short token that is essentially
// all-uppercase (one lowercase OCR slip allowed, e.g. "LYv" -> "LYV").
function tickerCandidate(line: string): string | null {
  const t = line.trim().replace(/[^A-Za-z0-9.$]/g, '');
  const core = t.replace(/^\$/, '').replace(/\.+$/, '');
  if (core.length < 1 || core.length > 5) return null;
  if (!/[A-Za-z]/.test(core)) return null;
  if ((core.match(/[a-z]/g) || []).length > 1) return null; // mostly uppercase
  if (!/^[A-Za-z]+\.?[A-Za-z0-9]{0,3}$/.test(core)) return null;
  return core.toUpperCase();
}

// A line looks like a company name if it carries lowercase letters and is not a
// number row or a piece of UI chrome. This is the signal that confirms a real
// portfolio row (e.g. "Southern Company" under "SO").
function looksLikeCompanyName(line: string): boolean {
  const t = (line ?? '').trim();
  if (!t || /^[\$\d.,%+\-\s]+$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  if ((t.match(/[a-z]/g) || []).length < 2) return false;
  if (UI_NEXT_LINE_WORDS.has(letters.toLowerCase())) return false;
  return true;
}

export function extractTickers(text: string): string[] {
  const tickers: string[] = [];
  const seen = new Set<string>();
  const push = (t: string | null | undefined) => {
    if (t && t.length >= 1 && t.length <= 6 && !seen.has(t)) {
      seen.add(t);
      tickers.push(t);
    }
  };

  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  // ── Pass 1 (high confidence): $TICKER cashtags ──
  const dollarMatches = text.match(/\$[A-Za-z][A-Za-z0-9.]{0,5}\b/g);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      const cand = normalizeTickerCandidate(m.replace('$', ''));
      if (cand && !COMMON_WORDS.has(cand) && !FALSE_POSITIVES.has(cand)) push(cand);
    }
  }

  // ── Pass 2 (high confidence): TICKER directly above its company name ──
  // This is the dominant layout in brokerage/portfolio screenshots and the most
  // reliable signal we have. A company name beneath the token confirms a real
  // holding, so we trust it even if the token is a stop-word (e.g. "SO" =
  // Southern Company) or absent from our local universe (e.g. ETFs like SIVR /
  // IBIT / SGOL). Live scoring + FMP validate the ticker downstream. It also
  // rejects stray single-letter OCR fragments (O / C / T / A) that have no
  // company name under them.
  let structuralHits = 0;
  for (let i = 0; i < lines.length; i++) {
    const cand = tickerCandidate(lines[i]);
    if (!cand || FALSE_POSITIVES.has(cand)) continue;
    if (looksLikeCompanyName(lines[i + 1])) {
      structuralHits++;
      push(cand);
    }
  }

  // ── Pass 3 (fallback): only when no structural rows were found, e.g. a bare
  // watchlist with no company names. Universe-gated and single-letter-safe so it
  // never re-introduces the O/C/T fragment false positives. ──
  if (structuralHits === 0) {
    const addFallback = (raw: string) => {
      const cand = normalizeTickerCandidate(raw);
      if (!cand || cand.length < 2) return; // never trust bare single letters here
      if (COMMON_WORDS.has(cand) || FALSE_POSITIVES.has(cand)) return;
      if (VALID_TICKERS.has(cand)) push(cand);
      else push(fuzzyMatchTicker(cand));
    };

    for (const line of lines) {
      const startMatch = line.match(/^(\$?[A-Z]{1,5}[A-Z0-9]?)\s*[\$\|\-\—:]/);
      if (startMatch) addFallback(startMatch[1]);
    }
    const wordMatches = text.match(/\b[A-Z]{2,5}\b/g);
    if (wordMatches) {
      for (const m of wordMatches) addFallback(m);
    }
  }

  return tickers;
}

export interface OCRResult {
  tickers: string[];
  rawText: string;
}

export async function runOCR(imagePath: string): Promise<OCRResult> {
  const worker = await createWorker('eng');
  try {
    // Read full mixed-case text in AUTO layout mode. The company-name line under
    // each ticker (e.g. "Southern Company" beneath "SO") is the key disambiguation
    // signal, so we must NOT restrict to uppercase — the old uppercase-only
    // whitelist destroyed those lines and mangled multi-letter tickers.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    const { data: { text } } = await worker.recognize(imagePath);
    const tickers = extractTickers(text);
    return { tickers, rawText: text };
  } finally {
    await worker.terminate();
  }
}

export interface ScoredTicker {
  ticker: string;
  score: number | null;
  price?: number;
  changePct?: number;
  signal?: 'buy' | 'hold' | 'sell';
}

export async function scoreTickers(tickers: string[], userId?: number): Promise<ScoredTicker[]> {
  const results: ScoredTicker[] = [];
  for (const ticker of tickers.slice(0, 10)) {
    try {
      const scoreResult = await computeOpenBoxScore(ticker, userId);
      if (scoreResult) {
        results.push({
          ticker,
          score: scoreResult.finalScore,
          signal: scoreResult.finalScore >= 70 ? 'buy' : scoreResult.finalScore >= 45 ? 'hold' : 'sell',
        });
      } else {
        const quote = await fmp.getQuote(ticker);
        if (quote) {
          results.push({ ticker, score: null, price: quote.price, changePct: quote.changesPercentage });
        } else {
          results.push({ ticker, score: null });
        }
      }
    } catch (err) {
      try {
        const quote = await fmp.getQuote(ticker);
        if (quote) {
          results.push({ ticker, score: null, price: quote.price, changePct: quote.changesPercentage });
        } else {
          results.push({ ticker, score: null });
        }
      } catch {
        results.push({ ticker, score: null });
      }
    }
    // Delay to avoid hammering Yahoo
    if (tickers.length > 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  return results;
}

export function getTmpDir(): string {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  return TMP_DIR;
}

export function makeTmpPath(prefix: string): string {
  return path.join(getTmpDir(), `${prefix}_${Date.now()}.jpg`);
}

export function cleanupFile(filePath: string): void {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}

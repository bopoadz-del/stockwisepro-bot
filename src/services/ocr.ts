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

function looksLikeTickerContext(line: string, ticker: string): boolean {
  // A ticker is more likely if a nearby token looks like a price or percent
  const idx = line.toUpperCase().indexOf(ticker);
  if (idx === -1) return false;
  const snippet = line.slice(Math.max(0, idx - 20), idx + ticker.length + 20);
  return /[\$\%\d]/.test(snippet);
}

export function extractTickers(text: string): string[] {
  const tickers: string[] = [];
  const seen = new Set<string>();

  const addTicker = (raw: string, source: string) => {
    const candidate = normalizeTickerCandidate(raw);
    if (!candidate || candidate.length < 1 || candidate.length > 6) return;
    if (COMMON_WORDS.has(candidate) || FALSE_POSITIVES.has(candidate)) return;

    const matched = fuzzyMatchTicker(candidate);
    if (matched && !seen.has(matched)) {
      seen.add(matched);
      tickers.push(matched);
      // logger.debug is unavailable; keep silent in hot path
    }
  };

  // Pattern 1: $TICKER (high confidence)
  const dollarMatches = text.match(/\$[A-Z0-9.]{1,6}\b/gi);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      addTicker(m.replace('$', ''), '$prefix');
    }
  }

  // Pattern 2: Lines that start with TICKER followed by price/percent
  const lines = text.split(/[\n\r]+/);
  for (const line of lines) {
    const startMatch = line.match(/^(\b[A-Z0-9.]{1,6}\b)\s*[\$\|\-\—]/i);
    if (startMatch) {
      addTicker(startMatch[1], 'line-start');
    }
  }

  // Pattern 3: Standalone uppercase/alphanumeric 1-6 char tokens
  // Require at least one letter and context (price/percent nearby) to reduce false positives
  const wordMatches = text.match(/\b[A-Z]{1,6}\b/g);
  if (wordMatches) {
    for (const m of wordMatches) {
      const candidate = m.toUpperCase();
      if (candidate.length < 1 || COMMON_WORDS.has(candidate) || FALSE_POSITIVES.has(candidate)) continue;
      if (!/^[A-Z]+$/.test(candidate)) continue;
      if (VALID_TICKERS.has(candidate)) {
        addTicker(candidate, 'standalone-valid');
      } else if (candidate.length >= 2 && candidate.length <= 5) {
        // Only consider fuzzy matches if the word is in a financial context
        const hasContext = lines.some((line) =>
          line.toUpperCase().includes(candidate) && looksLikeTickerContext(line, candidate)
        );
        if (hasContext) {
          addTicker(candidate, 'standalone-fuzzy');
        }
      }
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
    // Optimize for ticker recognition: uppercase letters, $, digits, and punctuation
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ$0123456789.,%-/ ',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
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

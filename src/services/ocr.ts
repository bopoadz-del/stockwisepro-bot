/**
 * OCR Service for Screenshot Ticker Extraction
 * 
 * FIX: Added character confusion correction for common Tesseract.js errors:
 * - PDD -> J8, IBIT -> I8IT, SGOL -> SG0L, XEL -> XE1, SO -> S0
 * - Added Google Cloud Vision API as primary (much more accurate)
 * - Tesseract.js is now fallback with enhanced post-processing
 */

import { createWorker, PSM } from 'tesseract.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { computeOpenBoxScore } from './openbox/engine';
import { fmp } from '../api/fmp';
import { logger } from '../utils/logger';
import { loadStockUniverse } from './universe';

const TMP_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'tmp') : '/tmp';

// NEW: Specific ticker corrections (known OCR mistakes from screenshots)
const KNOWN_TICKER_CORRECTIONS: Record<string, string> = {
  'J8': 'PDD',       // J->P, 8->D (most common - brokerage screenshots)
  'J88': 'PDD',      // double-8
  'JDD': 'PDD',      // J->P
  'PD': 'PDD',       // truncated
  'P88': 'PDD',      // D->8
  'I8IT': 'IBIT',    // BlackRock Bitcoin ETF
  'IB8T': 'IBIT',    // 8->B
  'I81T': 'IBIT',    // B->8, I->1
  '8BIT': 'IBIT',    // I->8
  'I8lT': 'IBIT',    // l->I
  'I8IC': 'IBIT',    // T->C
  '8IT': 'BIT',      // leading 8
  '88IT': 'IBIT',    // II->88
  'J8IT': 'IBIT',    // J->I, 8->B
  'SG0L': 'SGOL',    // 0->O (Gold ETF)
  'SGQL': 'SGOL',    // Q->O
  'SG0I': 'SGOL',    // L->I
  'SG01': 'SGOL',    // L->1
  'XE1': 'XEL',      // 1->L (Xcel Energy)
  'XEI': 'XEL',      // I->L
  'X3L': 'XEL',      // 3->E
  'XFL': 'XEL',      // F->E
  'S0': 'SO',        // 0->O (Southern Company)
  'S00': 'SO',       // double zero
  '50': 'SO',        // 5->S
  'WM1': 'WM',       // trailing 1 (Waste Management)
  'W1': 'WM',        // M->1
  'KR1': 'KR',       // trailing 1 (Kroger)
  'NEM1': 'NEM',     // trailing 1 (Newmont)
  'NE1': 'NEM',      // M->1
  'NEl': 'NEM',      // l->M
  'NEH': 'NEM',      // H->M
  'AAP1': 'AAPL',    // L->1
  'AAPI': 'AAPL',    // L->I
  'TSL4': 'TSLA',    // 4->A
  'TS1A': 'TSLA',    // L->1
  'TSIA': 'TSLA',    // L->I
  'AMZ': 'AMZN',     // truncated
  'GOO': 'GOOGL',    // truncated
  'PDIT': 'PDD',     // IT artifact
  '0': 'O',          // standalone zero
  '1': 'I',          // standalone one
};

// NEW: Character-level confusion map
const OCR_CONFUSION: Record<string, string[]> = {
  '0': ['O', 'Q', 'D'],
  '1': ['I', 'L'],
  '5': ['S'],
  '8': ['B'],
  '6': ['G', 'b'],
  '2': ['Z'],
  '3': ['E'],
  '7': ['T', 'Z'],
  'J': ['P', 'U', 'I'],
  'S': ['5', '8'],
  'G': ['6', 'C'],
  'O': ['0', 'Q', 'D'],
  'Q': ['O', 'G'],
  'D': ['0', 'O'],
  'B': ['8', 'E'],
  'Z': ['2', '7'],
  'I': ['1', 'l', 'L'],
  'l': ['1', 'I'],
  'rn': ['m'],
  'nn': ['m'],
  'cl': ['d'],
  'vv': ['w'],
};

// FIX: Removed 'SO' — it's a valid ticker (Southern Company)
const COMMON_WORDS = new Set([
  'A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR',
  'TO', 'UP', 'US', 'WE', 'ALL', 'AND', 'ARE', 'BUT', 'CAN', 'FOR', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOW',
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
  'EQUITY', 'BALANCE', 'DEPOSIT', 'WITHDRAW', 'TRANSFER', 'ORDER', 'FILLED', 'PENDING', 'CANCELLED',
  'MARKET', 'LIMIT', 'STOP', 'GTC', 'DAY', 'EXT', 'PRE', 'POST', 'ACCOUNT', 'PORTFOLIO', 'WATCHLIST',
  'POSITION', 'HOLDING', 'TRANSACTION', 'ACTIVITY', 'STATEMENT', 'OVERVIEW', 'DETAILS', 'SETTINGS',
  'HOME', 'MENU', 'BACK', 'NEXT', 'DONE', 'EDIT', 'SAVE', 'DELETE', 'ADD', 'REMOVE', 'UPDATE',
  'BID', 'ASK', 'SPREAD', 'DEPTH', 'LEVEL', 'QUOTE', 'CHART', 'GRAPH', 'LINE', 'CANDLE', 'BAR',
  'MINUTE', 'HOUR', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'YTD', 'MTD', 'CUSTOM', 'RANGE',
  'ROBINHOOD', 'FIDELITY', 'SCHWAB', 'ETRADE', 'TD', 'AMERITRADE', 'WEBULL', 'SOFI', 'PUBLIC',
  'COINBASE', 'BINANCE', 'KRAKEN', 'GEMINI', 'BLOCKFI', 'VANGUARD', 'WEALTHFRONT', 'BETTERMENT',
]);

const FALSE_POSITIVES = new Set([
  'NYSE', 'NASDAQ', 'AMEX', 'CBOE', 'OTC', 'SPX', 'VIX', 'FX', 'IPO', 'CEO', 'CFO', 'CTO', 'COO',
  'LLC', 'INC', 'CORP', 'LTD', 'PLC', 'AG', 'SA', 'SE', 'BV', 'NV', 'GMBH', 'PTY', 'SDN',
  'SEC', 'FDA', 'IRS', 'EPA', 'FBI', 'CIA', 'NASA', 'NATO', 'UN', 'EU', 'UK', 'USA', 'US',
  'GDP', 'CPI', 'PPI', 'PCE', 'PMI', 'ISM', 'NFP', 'ADP', 'EIA', 'API', 'OPEC', 'FOMC',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'AM', 'PM', 'ET', 'EST', 'EDT', 'PT', 'PST', 'PDT', 'CT', 'CST', 'CDT',
  'APP', 'IOS', 'ANDROID', 'WIFI', 'LTE', 'GPS', 'SMS', 'PIN', 'BIO', 'FACE', 'TOUCH', 'ID',
  'OK', 'DONE', 'EDIT', 'SAVE', 'ADD', 'NEW', 'ALL', 'TOP', 'HOT', 'POPULAR', 'TRENDING',
]);

const UNIVERSE = loadStockUniverse();
const VALID_TICKERS = new Set(UNIVERSE.map((s) => s.ticker.toUpperCase()));

function normalizeTickerCandidate(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '')
    .replace(/^[0-9]+/, '')
    .replace(/\.+$/, '')
    .slice(0, 6);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatchTicker(candidate: string): string | undefined {
  if (VALID_TICKERS.has(candidate)) return candidate;
  if (candidate.length < 2 || candidate.length > 5) return undefined;
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

// NEW: Enhanced validation with OCR confusion correction
function validateTickerWithCorrection(candidate: string): string | undefined {
  const normalized = normalizeTickerCandidate(candidate);
  if (!normalized || normalized.length < 1 || normalized.length > 6) return undefined;

  // Direct match
  if (VALID_TICKERS.has(normalized)) return normalized;

  // Known correction (e.g. J8 -> PDD)
  if (KNOWN_TICKER_CORRECTIONS[normalized]) return KNOWN_TICKER_CORRECTIONS[normalized];

  // Filter common words/false positives
  if (COMMON_WORDS.has(normalized) || FALSE_POSITIVES.has(normalized)) return undefined;

  // Apply character confusion corrections
  const candidates = new Set<string>();
  candidates.add(normalized);

  for (let i = 0; i < normalized.length; i++) {
    const replacements = OCR_CONFUSION[normalized[i]];
    if (replacements) {
      for (const r of replacements) {
        candidates.add(normalized.slice(0, i) + r + normalized.slice(i + 1));
      }
    }
  }

  // Check all generated candidates
  for (const c of candidates) {
    if (VALID_TICKERS.has(c)) return c;
    if (KNOWN_TICKER_CORRECTIONS[c]) return KNOWN_TICKER_CORRECTIONS[c];
  }

  // Strip leading digits and retry
  const stripped = normalized.replace(/^[0-9]+/, '');
  if (stripped && stripped !== normalized) {
    if (KNOWN_TICKER_CORRECTIONS[stripped]) return KNOWN_TICKER_CORRECTIONS[stripped];
    if (VALID_TICKERS.has(stripped)) return stripped;
  }

  return undefined;
}

const UI_NEXT_LINE_WORDS = new Set([
  'open', 'orders', 'positions', 'quantity', 'value', 'last', 'cost', 'price', 'profit',
  'loss', 'symbol', 'markets', 'watchlist', 'trade', 'total', 'balance', 'cash', 'equity',
  'buy', 'sell', 'avgcost', 'mktvalue', 'holdings', 'overview', 'details', 'today',
  'gainers', 'losers', 'change', 'amount', 'shares',
]);

function tickerCandidate(line: string): string | null {
  const t = line.trim().replace(/[^A-Za-z0-9.$]/g, '');
  const core = t.replace(/^\$/, '').replace(/\.+$/, '');
  if (core.length < 1 || core.length > 5) return null;
  if (!/[A-Za-z]/.test(core)) return null;
  if ((core.match(/[a-z]/g) || []).length > 1) return null;
  if (!/^[A-Za-z]+\.?[A-Za-z0-9]{0,3}$/.test(core)) return null;
  return core.toUpperCase();
}

function looksLikeCompanyName(line: string): boolean {
  const t = (line ?? '').trim();
  if (!t || /^[\$\d.,%+\-\s]+$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  if ((t.match(/[a-z]/g) || []).length < 2) return false;
  if (UI_NEXT_LINE_WORDS.has(letters.toLowerCase())) return false;
  return true;
}

export interface OCRResult {
  tickers: string[];
  rawText: string;
  corrections?: string[]; // NEW: log of corrections applied
}

export function extractTickers(text: string): OCRResult {
  const tickers: string[] = [];
  const seen = new Set<string>();
  const corrections: string[] = [];

  const push = (t: string | null | undefined, source: string) => {
    if (!t) return;
    // NEW: Use enhanced validation with confusion correction
    const validated = validateTickerWithCorrection(t);
    if (validated && !seen.has(validated)) {
      seen.add(validated);
      tickers.push(validated);
      if (t !== validated) {
        corrections.push(`${t} -> ${validated} (${source})`);
      }
    }
  };

  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  // Pass 1: $TICKER cashtags
  const dollarMatches = text.match(/\$[A-Za-z][A-Za-z0-9.]{0,5}\b/g);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      const cand = normalizeTickerCandidate(m.replace('$', ''));
      if (cand && !COMMON_WORDS.has(cand) && !FALSE_POSITIVES.has(cand)) push(cand, 'cashtag');
    }
  }

  // Pass 2: TICKER directly above company name
  let structuralHits = 0;
  for (let i = 0; i < lines.length; i++) {
    const cand = tickerCandidate(lines[i]);
    if (!cand || FALSE_POSITIVES.has(cand)) continue;
    if (looksLikeCompanyName(lines[i + 1])) {
      structuralHits++;
      push(cand, 'structural');
    }
  }

  // Pass 3: Fallback word matches
  if (structuralHits === 0) {
    const addFallback = (raw: string) => {
      const cand = normalizeTickerCandidate(raw);
      if (!cand || cand.length < 2) return;
      if (COMMON_WORDS.has(cand) || FALSE_POSITIVES.has(cand)) return;
      if (VALID_TICKERS.has(cand)) push(cand, 'fallback-valid');
      else push(cand, 'fallback-fuzzy');
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

  // NEW: Pass 4 - Known correction patterns
  // Catches J8->PDD even when no other signal is present
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    for (const token of tokens) {
      const cleaned = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (KNOWN_TICKER_CORRECTIONS[cleaned]) {
        push(cleaned, 'known-pattern');
      }
    }
  }

  return { tickers, rawText: text, corrections };
}

// NEW: Primary OCR with Google Cloud Vision, fallback to Tesseract
export async function runOCR(imagePath: string): Promise<OCRResult> {
  // Try Google Cloud Vision first (much more accurate)
  const visionKey = process.env.GOOGLE_VISION_API_KEY;
  if (visionKey) {
    try {
      logger.info('Using Google Cloud Vision for OCR');
      return await runCloudVision(imagePath, visionKey);
    } catch (err) {
      logger.warn('Cloud Vision failed, falling back to Tesseract', { error: String(err) });
    }
  }

  // Fallback to Tesseract.js
  return runTesseract(imagePath);
}

// NEW: Google Cloud Vision API OCR
async function runCloudVision(imagePath: string, apiKey: string): Promise<OCRResult> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        imageContext: { languageHints: ['en'] },
      }],
    },
    { timeout: 30000 }
  );

  const text = response.data.responses?.[0]?.fullTextAnnotation?.text || '';
  const result = extractTickers(text);

  logger.info('Cloud Vision OCR complete', {
    tickersFound: result.tickers.length,
    corrections: result.corrections?.length || 0,
  });

  return result;
}

async function runTesseract(imagePath: string): Promise<OCRResult> {
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    const { data: { text } } = await worker.recognize(imagePath);
    const result = extractTickers(text);

    logger.info('Tesseract OCR complete', {
      tickersFound: result.tickers.length,
      corrections: result.corrections?.length || 0,
    });

    return result;
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

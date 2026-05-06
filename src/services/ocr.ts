import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { computeOpenBoxScore } from './openbox/engine';
import { fmp } from '../api/fmp';
import { logger } from '../utils/logger';

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
]);

export function extractTickers(text: string): string[] {
  const tickers: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: $TICKER
  const dollarMatches = text.match(/\$([A-Z]{1,5})\b/g);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      const ticker = m.replace('$', '').toUpperCase();
      if (!seen.has(ticker) && ticker.length >= 1 && ticker.length <= 5 && !FALSE_POSITIVES.has(ticker)) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
  }

  // Pattern 2: Standalone uppercase 1-5 letter words
  const wordMatches = text.match(/\b[A-Z]{1,5}\b/g);
  if (wordMatches) {
    for (const m of wordMatches) {
      const ticker = m.toUpperCase();
      if (
        ticker.length >= 1 &&
        ticker.length <= 5 &&
        !COMMON_WORDS.has(ticker) &&
        !FALSE_POSITIVES.has(ticker) &&
        !seen.has(ticker) &&
        /^[A-Z]+$/.test(ticker)
      ) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
  }

  // Pattern 3: Known brokerage format "TICKER - Company Name" or "TICKER | Price"
  const lineMatches = text.split(/[\n\r]+/);
  for (const line of lineMatches) {
    // Match patterns like "AAPL  $195.89" or "AAPL | 1.27%" at start of line
    const startMatch = line.match(/^(\b[A-Z]{1,5}\b)\s*[\$\|\-\—]/);
    if (startMatch) {
      const ticker = startMatch[1].toUpperCase();
      if (!seen.has(ticker) && !COMMON_WORDS.has(ticker) && !FALSE_POSITIVES.has(ticker)) {
        seen.add(ticker);
        tickers.push(ticker);
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

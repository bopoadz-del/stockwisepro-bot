import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { Cache } from '../utils/cache';

const cache = new Cache<{ data: YahooQuote[]; error: string | null }>(5 * 60 * 1000);

export interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  type?: string;
  price?: number;
}

export async function yahooSearch(query: string): Promise<{ data: YahooQuote[]; error: string | null }> {
  const cached = cache.get(query);
  if (cached) return cached;

  const start = Date.now();
  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: {
        q: query,
        quotesCount: 8,
        newsCount: 0,
        listsCount: 0,
        enableFuzzyQuery: true,
      },
      timeout: 8000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; StockWiseBot/1.0)',
      },
    });

    const quotes = res.data?.quotes || [];
    // Filter to only equity stocks (exclude funds, currencies, etc.)
    const stocks = quotes.filter((q: any) => q.typeDisp === 'Equity' || q.type === 'EQUITY' || !q.type);
    logger.info('Yahoo search OK', { query, results: stocks.length, duration: Date.now() - start });
    const result = { data: stocks as YahooQuote[], error: null };
    cache.set(query, result);
    return result;
  } catch (err) {
    const axiosErr = err as AxiosError;
    logger.error('Yahoo search failed', { message: axiosErr.message, status: axiosErr.response?.status });
    return { data: [], error: axiosErr.message };
  }
}

export interface HistoricalPrice {
  date: string;
  close: number;
}

const histCache = new Cache<{ data: HistoricalPrice[]; error: string | null }>(15 * 60 * 1000);

export async function getHistoricalPrices(ticker: string, range: '1y' | '2y' | '5y' = '1y'): Promise<{ data: HistoricalPrice[]; error: string | null }> {
  const cacheKey = `${ticker}:${range}`;
  const cached = histCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}`, {
      params: { interval: '1d', range },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; StockWiseBot/1.0)',
      },
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) {
      return { data: [], error: 'No historical data found' };
    }

    const timestamps: number[] = result.timestamp || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];

    const data: HistoricalPrice[] = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i],
    })).filter((d: HistoricalPrice) => d.close != null);

    const output = { data, error: null };
    histCache.set(cacheKey, output);
    return output;
  } catch (err) {
    const axiosErr = err as AxiosError;
    logger.error('Yahoo historical prices failed', { ticker, message: axiosErr.message, status: axiosErr.response?.status });
    return { data: [], error: axiosErr.message };
  }
}

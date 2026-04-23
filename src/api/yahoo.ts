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

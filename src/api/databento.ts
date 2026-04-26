import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

const BASE_URL = 'https://hist.databento.com/v0';

export interface DatabentoTrade {
  symbol: string;
  price: number;
  size: number;
  ts: number; // nanoseconds epoch
}

export interface DatabentoQuote {
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  ts: number;
}

class DatabentoAdapter {
  private client = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'Authorization': config.databentoApiKey ? `Bearer ${config.databentoApiKey}` : '',
    },
  });

  enabled = !!config.databentoApiKey;

  private datasetForTicker(ticker: string): string {
    // Map US equities to Nasdaq ITCH dataset
    // Databento datasets: XNAS.ITCH, NYSE.PILLAR, BATS.PITCH, etc.
    return 'XNAS.ITCH';
  }

  async getLatestTrade(ticker: string): Promise<DatabentoTrade | null> {
    if (!this.enabled) return null;
    const upper = ticker.toUpperCase();
    const dataset = this.datasetForTicker(upper);

    // Request last 5 minutes of trades
    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);

    try {
      const res = await this.client.get('/timeseries.get_range', {
        params: {
          dataset,
          symbols: upper,
          schema: 'trades',
          start: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          end: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          stype_in: 'raw_symbol',
          encoding: 'json',
          limit: 10,
        },
      });

      const trades = res.data?.data || [];
      if (trades.length === 0) return null;

      // Get most recent trade
      const latest = trades[trades.length - 1];
      return {
        symbol: latest.symbol || upper,
        price: latest.price,
        size: latest.size,
        ts: latest.ts_event || latest.ts,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('Databento getLatestTrade failed', {
        ticker: upper,
        status: axiosErr.response?.status,
        message: axiosErr.message,
        data: axiosErr.response?.data,
      });
      return null;
    }
  }

  async getLatestQuote(ticker: string): Promise<DatabentoQuote | null> {
    if (!this.enabled) return null;
    const upper = ticker.toUpperCase();
    const dataset = this.datasetForTicker(upper);

    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);

    try {
      const res = await this.client.get('/timeseries.get_range', {
        params: {
          dataset,
          symbols: upper,
          schema: 'mbp-1', // market-by-price level 1 (best bid/ask)
          start: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          end: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          stype_in: 'raw_symbol',
          encoding: 'json',
          limit: 10,
        },
      });

      const quotes = res.data?.data || [];
      if (quotes.length === 0) return null;

      const latest = quotes[quotes.length - 1];
      return {
        symbol: latest.symbol || upper,
        bid: latest.bid_px,
        ask: latest.ask_px,
        bidSize: latest.bid_sz,
        askSize: latest.ask_sz,
        ts: latest.ts_event || latest.ts,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('Databento getLatestQuote failed', {
        ticker: upper,
        status: axiosErr.response?.status,
        message: axiosErr.message,
        data: axiosErr.response?.data,
      });
      return null;
    }
  }
}

export const databento = new DatabentoAdapter();

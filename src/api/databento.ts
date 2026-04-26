import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

const BASE_URL = 'https://hist.databento.com/v0';

export interface DatabentoMetadata {
  ticker: string;
  price: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  timestamp: number; // ms epoch
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

  async getQuote(ticker: string): Promise<DatabentoMetadata | null> {
    if (!this.enabled) return null;
    try {
      // Databento schema reference: mbp-1 = market-by-price (best bid/ask)
      // We use their timeseries snapshot endpoint (simplified)
      const res = await this.client.get('/metadata.get_dataset_range', {
        params: { dataset: 'XNAS.ITCH', symbols: ticker },
      });

      // Databento returns ranges for historical; for live quotes we'd need
      // a live subscription. This is a placeholder for the HTTP metadata path.
      // In production, swap this for their WebSocket live feed.
      logger.info('Databento metadata fetched', { ticker, status: res.status });
      return null; // HTTP API is range metadata; live quotes need WS
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('Databento fetch failed', { ticker, message: axiosErr.message, status: axiosErr.response?.status });
      return null;
    }
  }

  // ── Live WebSocket placeholder ────────────────────────────────────────────
  // Databento live feed uses DBN (Databento Binary Encoding) over WebSocket.
  // Official Node.js DBN decoder is not yet on npm (as of 2026-04).
  // When available, replace this stub with a real ws connection + DBN parser.
  //
  // Example upgrade path:
  //   import { DBNDecoder } from '@databento/dbn';
  //   const ws = new WebSocket('wss://live.databento.com/v0/stream');
  //   ws.on('message', (buf) => {
  //     const record = new DBNDecoder().decode(buf);
  //     normalizeAndCache(record);
  //   });
  // ──────────────────────────────────────────────────────────────────────────
}

export const databento = new DatabentoAdapter();

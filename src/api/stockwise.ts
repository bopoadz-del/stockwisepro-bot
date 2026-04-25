import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class StockWiseApi {
  private client: AxiosInstance;
  private jwtToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.stockwiseApiBaseUrl,
      timeout: 70000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.stockwiseApiKey ? { 'X-API-Key': config.stockwiseApiKey } : {}),
      },
    });

    // Request interceptor for JWT
    this.client.interceptors.request.use((req) => {
      if (this.jwtToken) {
        req.headers.Authorization = `Bearer ${this.jwtToken}`;
      }
      return req;
    });
  }

  async authenticateAsBot(): Promise<boolean> {
    if (!config.stockwiseBotEmail || !config.stockwiseBotPassword) {
      logger.warn('No bot credentials configured; running in guest mode');
      return false;
    }
    try {
      const res = await this.client.post('/api/auth/login', {
        email: config.stockwiseBotEmail,
        password: config.stockwiseBotPassword,
      });
      this.jwtToken = res.data.token || res.data.accessToken || null;
      logger.info('Authenticated as bot user');
      return true;
    } catch (err) {
      logger.error('Bot auth failed', { error: (err as AxiosError).message });
      return false;
    }
  }

  async searchStocks(query: string, telegramId?: number) {
    return this.getWithRetry(`/api/stocks/search?q=${encodeURIComponent(query)}`, telegramId);
  }

  async getStock(ticker: string, telegramId?: number) {
    return this.getWithRetry(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`, telegramId);
  }

  async getStocks() {
    return this.getWithRetry('/api/stocks');
  }

  async getWatchlist(telegramId?: number) {
    return this.getWithRetry('/api/watchlist', telegramId);
  }

  async addToWatchlist(ticker: string, telegramId?: number) {
    return this.post('/api/watchlist', { ticker }, telegramId);
  }

  async removeFromWatchlist(id: number, telegramId?: number) {
    return this.delete(`/api/watchlist/${id}`, telegramId);
  }

  async getPortfolio(telegramId?: number) {
    return this.getWithRetry('/api/portfolio', telegramId);
  }

  async mimicInvestor(investorId: string, amount?: number, telegramId?: number) {
    return this.post('/api/portfolio/mimic', { investorId, amount }, telegramId);
  }

  async getStockScore(ticker: string, telegramId?: number) {
    return this.getWithRetry(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`, telegramId);
  }

  async runExperiment(formula: string, ticker?: string, telegramId?: number) {
    return this.post('/api/experiments', { formula, ticker }, telegramId);
  }

  private async getWithRetry(path: string, telegramId?: number, retries = 2, maxTotalMs = 90000) {
    const start = Date.now();
    const headers: Record<string, string> = {};
    if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (Date.now() - start > maxTotalMs) {
        logger.error(`GET ${path} exceeded max total duration`);
        return { data: null, duration: Date.now() - start, error: 'Request timeout' };
      }
      try {
        const res = await this.client.get(path, { headers });
        return { data: res.data, duration: Date.now() - start, error: null };
      } catch (err) {
        const axiosErr = err as AxiosError;
        const isTimeout = axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout');
        const is5xx = axiosErr.response && axiosErr.response.status >= 500;
        const shouldRetry = (isTimeout || is5xx) && attempt < retries;

        if (shouldRetry) {
          logger.warn(`GET ${path} failed (attempt ${attempt + 1}), retrying...`, { error: axiosErr.message });
          await sleep(2000);
          continue;
        }

        logger.error(`GET ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
        return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
      }
    }
    return { data: null, duration: Date.now() - start, error: 'Max retries exceeded' };
  }

  private async post(path: string, body: unknown, telegramId?: number) {
    const start = Date.now();
    const headers: Record<string, string> = {};
    if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);
    try {
      const res = await this.client.post(path, body, { headers });
      return { data: res.data, duration: Date.now() - start, error: null };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error(`POST ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
      return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
    }
  }

  private async delete(path: string, telegramId?: number) {
    const start = Date.now();
    const headers: Record<string, string> = {};
    if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);
    try {
      const res = await this.client.delete(path, { headers });
      return { data: res.data, duration: Date.now() - start, error: null };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error(`DELETE ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
      return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
    }
  }
}

export const stockwise = new StockWiseApi();

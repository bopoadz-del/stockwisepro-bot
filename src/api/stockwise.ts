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
      timeout: 60000,
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

  async searchStocks(query: string) {
    return this.getWithRetry(`/api/stocks/search?q=${encodeURIComponent(query)}`);
  }

  async getStock(ticker: string) {
    return this.getWithRetry(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`);
  }

  async getStocks() {
    return this.getWithRetry('/api/stocks');
  }

  async getWatchlist() {
    return this.getWithRetry('/api/watchlist');
  }

  async addToWatchlist(ticker: string) {
    return this.post('/api/watchlist', { ticker });
  }

  async removeFromWatchlist(id: number) {
    return this.delete(`/api/watchlist/${id}`);
  }

  async getPortfolio() {
    return this.getWithRetry('/api/portfolio');
  }

  async mimicInvestor(investorId: string, amount?: number) {
    return this.post('/api/portfolio/mimic', { investorId, amount });
  }

  async getStockScore(ticker: string) {
    // If your API has a dedicated scoring endpoint, adjust here
    // Fallback: fetch stock details and return raw data for bot-side scoring or display
    return this.getWithRetry(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`);
  }

  async runExperiment(formula: string, ticker?: string) {
    // Adjust endpoint based on your actual Experiment Workspace API
    return this.post('/api/experiments', { formula, ticker });
  }

  private async getWithRetry(path: string, retries = 2) {
    const start = Date.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.client.get(path);
        return { data: res.data, duration: Date.now() - start, error: null };
      } catch (err) {
        const axiosErr = err as AxiosError;
        const isTimeout = axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout');
        const is5xx = axiosErr.response && axiosErr.response.status >= 500;
        const shouldRetry = (isTimeout || is5xx) && attempt < retries;

        if (shouldRetry) {
          logger.warn(`GET ${path} failed (attempt ${attempt + 1}), retrying...`, { error: axiosErr.message });
          await sleep(3000);
          continue;
        }

        logger.error(`GET ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
        return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
      }
    }
    return { data: null, duration: Date.now() - start, error: 'Max retries exceeded' };
  }

  private async post(path: string, body: unknown) {
    const start = Date.now();
    try {
      const res = await this.client.post(path, body);
      return { data: res.data, duration: Date.now() - start, error: null };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error(`POST ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
      return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
    }
  }

  private async delete(path: string) {
    const start = Date.now();
    try {
      const res = await this.client.delete(path);
      return { data: res.data, duration: Date.now() - start, error: null };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error(`DELETE ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
      return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
    }
  }
}

export const stockwise = new StockWiseApi();

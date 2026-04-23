import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

class StockWiseApi {
  private client: AxiosInstance;
  private jwtToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.stockwiseApiBaseUrl,
      timeout: 15000,
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
    return this.get(`/api/stocks/search?q=${encodeURIComponent(query)}`);
  }

  async getStock(ticker: string) {
    return this.get(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`);
  }

  async getStocks() {
    return this.get('/api/stocks');
  }

  async getWatchlist() {
    return this.get('/api/watchlist');
  }

  async addToWatchlist(ticker: string) {
    return this.post('/api/watchlist', { ticker });
  }

  async removeFromWatchlist(id: number) {
    return this.delete(`/api/watchlist/${id}`);
  }

  async getPortfolio() {
    return this.get('/api/portfolio');
  }

  async mimicInvestor(investorId: string, amount?: number) {
    return this.post('/api/portfolio/mimic', { investorId, amount });
  }

  async getStockScore(ticker: string) {
    // If your API has a dedicated scoring endpoint, adjust here
    // Fallback: fetch stock details and return raw data for bot-side scoring or display
    return this.get(`/api/stocks/${encodeURIComponent(ticker.toUpperCase())}`);
  }

  async runExperiment(formula: string, ticker?: string) {
    // Adjust endpoint based on your actual Experiment Workspace API
    return this.post('/api/experiments', { formula, ticker });
  }

  private async get(path: string) {
    const start = Date.now();
    try {
      const res = await this.client.get(path);
      return { data: res.data, duration: Date.now() - start, error: null };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error(`GET ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
      return { data: null, duration: Date.now() - start, error: axiosErr.response?.data || axiosErr.message };
    }
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

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class StockWiseApi {
  private client: AxiosInstance;
  private jwtToken: string | null = null;
  private isReauthenticating = false;
  private pendingRequests: Array<() => void> = [];

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

    // Response interceptor for auto-re-auth on 401
    this.client.interceptors.response.use(
      (res) => res,
      async (err: AxiosError) => {
        const originalRequest = err.config;
        if (!originalRequest) return Promise.reject(err);

        const status = err.response?.status;
        if (status === 401 && !originalRequest.headers['X-Retry-After-Reauth']) {
          if (this.isReauthenticating) {
            // Wait for re-auth to finish then retry
            await new Promise<void>((resolve) => this.pendingRequests.push(resolve));
            originalRequest.headers['X-Retry-After-Reauth'] = '1';
            return this.client.request(originalRequest);
          }

          this.isReauthenticating = true;
          try {
            const ok = await this.authenticateAsBot();
            if (ok) {
              originalRequest.headers['X-Retry-After-Reauth'] = '1';
              // Flush pending requests
              const pending = this.pendingRequests;
              this.pendingRequests = [];
              pending.forEach((resolve) => resolve());
              return this.client.request(originalRequest);
            }
          } catch (reauthErr) {
            logger.error('Auto re-auth failed', { error: (reauthErr as Error).message });
          } finally {
            this.isReauthenticating = false;
            const pending = this.pendingRequests;
            this.pendingRequests = [];
            pending.forEach((resolve) => resolve());
          }
        }
        return Promise.reject(err);
      }
    );
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
    return this.postWithRetry('/api/watchlist', { ticker }, telegramId);
  }

  async removeFromWatchlist(id: number, telegramId?: number) {
    return this.deleteWithRetry(`/api/watchlist/${id}`, telegramId);
  }

  async getPortfolio(telegramId?: number) {
    return this.getWithRetry('/api/portfolio', telegramId);
  }

  async mimicInvestor(investorId: string, amount?: number, telegramId?: number) {
    return this.postWithRetry('/api/portfolio/mimic', { investorId, amount }, telegramId);
  }

  async getStockScore(ticker: string, telegramId?: number) {
    // NOTE: /api/scores/:ticker does not exist on the current API.
    // This call will 404 and callers should fall back to the local OpenBox engine.
    return this.getWithRetry(`/api/scores/${encodeURIComponent(ticker.toUpperCase())}`, telegramId);
  }

  async runExperiment(formula: string, ticker?: string, telegramId?: number) {
    return this.postWithRetry('/api/experiments', { formula, ticker }, telegramId);
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
        return { data: null, duration: Date.now() - start, error: this.safeError(axiosErr) };
      }
    }
    return { data: null, duration: Date.now() - start, error: 'Max retries exceeded' };
  }

  private async postWithRetry(path: string, body: unknown, telegramId?: number, retries = 1) {
    const start = Date.now();
    const headers: Record<string, string> = {};
    if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.client.post(path, body, { headers });
        return { data: res.data, duration: Date.now() - start, error: null };
      } catch (err) {
        const axiosErr = err as AxiosError;
        const isTimeout = axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout');
        const is5xx = axiosErr.response && axiosErr.response.status >= 500;
        const shouldRetry = (isTimeout || is5xx) && attempt < retries;

        if (shouldRetry) {
          logger.warn(`POST ${path} failed (attempt ${attempt + 1}), retrying...`, { error: axiosErr.message });
          await sleep(2000);
          continue;
        }

        logger.error(`POST ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
        return { data: null, duration: Date.now() - start, error: this.safeError(axiosErr) };
      }
    }
    return { data: null, duration: Date.now() - start, error: 'Max retries exceeded' };
  }

  private async deleteWithRetry(path: string, telegramId?: number, retries = 1) {
    const start = Date.now();
    const headers: Record<string, string> = {};
    if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.client.delete(path, { headers });
        return { data: res.data, duration: Date.now() - start, error: null };
      } catch (err) {
        const axiosErr = err as AxiosError;
        const isTimeout = axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout');
        const is5xx = axiosErr.response && axiosErr.response.status >= 500;
        const shouldRetry = (isTimeout || is5xx) && attempt < retries;

        if (shouldRetry) {
          logger.warn(`DELETE ${path} failed (attempt ${attempt + 1}), retrying...`, { error: axiosErr.message });
          await sleep(2000);
          continue;
        }

        logger.error(`DELETE ${path} failed`, { status: axiosErr.response?.status, message: axiosErr.message });
        return { data: null, duration: Date.now() - start, error: this.safeError(axiosErr) };
      }
    }
    return { data: null, duration: Date.now() - start, error: 'Max retries exceeded' };
  }

  private safeError(axiosErr: AxiosError): string {
    const data = axiosErr.response?.data;
    if (typeof data === 'string') {
      if (data.length > 200) {
        return `HTTP ${axiosErr.response?.status}: HTML error page`;
      }
      return data;
    }
    if (data && typeof data === 'object') {
      try {
        return JSON.stringify(data);
      } catch {
        return `HTTP ${axiosErr.response?.status}: error`;
      }
    }
    return axiosErr.message;
  }
}

export const stockwise = new StockWiseApi();

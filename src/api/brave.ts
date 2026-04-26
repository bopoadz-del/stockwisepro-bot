import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Cache } from '../utils/cache';

const webCache = new Cache<{ data: any[]; duration: number; error: any }>(5 * 60 * 1000);
const newsCache = new Cache<{ data: any[]; duration: number; error: any }>(5 * 60 * 1000);

class BraveApi {
  private client = axios.create({
    baseURL: 'https://api.search.brave.com/res/v1',
    timeout: 10000,
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
    },
  });

  async webSearch(query: string, count = 5) {
    const cacheKey = `${query}:${count}`;
    const cached = webCache.get(cacheKey);
    if (cached) return cached;

    const start = Date.now();
    try {
      const res = await this.client.get('/web/search', {
        headers: { 'X-Subscription-Token': config.braveApiKey },
        params: { q: query, count, offset: 0 },
      });
      const result = {
        data: res.data?.web?.results || [],
        duration: Date.now() - start,
        error: null,
      };
      webCache.set(cacheKey, result);
      return result;
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('Brave web search failed', { status: axiosErr.response?.status, message: axiosErr.message });
      return {
        data: [],
        duration: Date.now() - start,
        error: axiosErr.response?.data || axiosErr.message,
      };
    }
  }

  async newsSearch(query: string, count = 5) {
    const cacheKey = `${query}:${count}`;
    const cached = newsCache.get(cacheKey);
    if (cached) return cached;

    const start = Date.now();
    try {
      const res = await this.client.get('/news/search', {
        headers: { 'X-Subscription-Token': config.braveApiKey },
        params: { q: query, count, offset: 0 },
      });
      const result = {
        data: res.data?.results || [],
        duration: Date.now() - start,
        error: null,
      };
      newsCache.set(cacheKey, result);
      return result;
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('Brave news search failed', { status: axiosErr.response?.status, message: axiosErr.message });
      return {
        data: [],
        duration: Date.now() - start,
        error: axiosErr.response?.data || axiosErr.message,
      };
    }
  }
}

export const brave = new BraveApi();

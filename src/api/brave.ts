import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

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
    const start = Date.now();
    try {
      const res = await this.client.get('/web/search', {
        headers: { 'X-Subscription-Token': config.braveApiKey },
        params: { q: query, count, offset: 0 },
      });
      return {
        data: res.data?.web?.results || [],
        duration: Date.now() - start,
        error: null,
      };
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
    const start = Date.now();
    try {
      const res = await this.client.get('/news/search', {
        headers: { 'X-Subscription-Token': config.braveApiKey },
        params: { q: query, count, offset: 0 },
      });
      return {
        data: res.data?.results || [],
        duration: Date.now() - start,
        error: null,
      };
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

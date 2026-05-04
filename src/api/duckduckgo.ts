import axios from 'axios';
import * as cheerio from 'cheerio';
import { search, SafeSearchType } from 'duck-duck-scrape';
import { logger } from '../utils/logger';
import { Cache } from '../utils/cache';

const cache = new Cache<{ data: any[]; duration: number; error: any }>(5 * 60 * 1000);

interface WebResult {
  title: string;
  description: string;
  url: string;
}

class DuckDuckGoApi {
  enabled = true;

  async webSearch(query: string, count = 5) {
    const cacheKey = `${query}:${count}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const start = Date.now();

    // Try official package first
    try {
      const res = await search(query, {
        safeSearch: SafeSearchType.OFF,
      });

      const results = (res.results || []).slice(0, count).map((r: any) => ({
        title: r.title || 'No title',
        description: r.description || '',
        url: r.url || '',
      }));

      const result = { data: results, duration: Date.now() - start, error: null };
      cache.set(cacheKey, result);
      return result;
    } catch (pkgErr) {
      const pkgMsg = pkgErr instanceof Error ? pkgErr.message : String(pkgErr);
      logger.warn('DuckDuckGo package search failed, trying HTML fallback', { message: pkgMsg });
    }

    // Fallback: scrape DuckDuckGo Lite HTML
    try {
      const results = await this.htmlSearch(query, count);
      const result = { data: results, duration: Date.now() - start, error: null };
      cache.set(cacheKey, result);
      return result;
    } catch (htmlErr) {
      const htmlMsg = htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
      logger.error('DuckDuckGo HTML fallback failed', { message: htmlMsg });
      return {
        data: [],
        duration: Date.now() - start,
        error: htmlMsg,
      };
    }
  }

  private async htmlSearch(query: string, count: number): Promise<WebResult[]> {
    const res = await axios.post(
      'https://lite.duckduckgo.com/lite/',
      new URLSearchParams({ q: query, df: '' }),
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
      }
    );

    const $ = cheerio.load(res.data);
    const results: WebResult[] = [];

    const links = $('a.result-link');
    const snippets = $('.result-snippet');

    for (let i = 0; i < Math.min(links.length, snippets.length, count); i++) {
      const linkEl = links.eq(i);
      const url = linkEl.attr('href') || '';
      const title = linkEl.text().trim();
      const description = snippets.eq(i).text().trim();

      if (url && title) {
        results.push({ title, description, url });
      }
    }

    return results;
  }
}

export const duckduckgo = new DuckDuckGoApi();

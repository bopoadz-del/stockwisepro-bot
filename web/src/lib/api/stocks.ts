import { apiClient } from './client';

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  marketCap: number;
  pe: number;
  volume: number;
  avgVolume: number;
  dayLow: number;
  dayHigh: number;
  yearLow: number;
  yearHigh: number;
  eps: number;
  score?: number;
  signal?: 'buy' | 'hold' | 'sell';
}

export interface KeyMetrics {
  peRatio: number;
  priceToBookRatio: number;
  priceToSalesRatio: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  dividendYield: number;
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const stocksApi = {
  search: (query: string) =>
    apiClient.get<{ symbol: string; name: string }[]>(`/stocks/search?q=${encodeURIComponent(query)}`),

  getQuote: (ticker: string) =>
    apiClient.get<StockQuote>(`/stocks/quote/${ticker}`),

  getBatchQuotes: (symbols: string[]) =>
    apiClient.get<StockQuote[]>(`/stocks/quotes?symbols=${symbols.join(',')}`),

  getKeyMetrics: (ticker: string) =>
    apiClient.get<KeyMetrics>(`/stocks/metrics/${ticker}`),

  getHistorical: (ticker: string, from: string, to: string) =>
    apiClient.get<HistoricalPrice[]>(`/stocks/historical/${ticker}?from=${from}&to=${to}`),

  getIndices: () =>
    apiClient.get<StockQuote[]>('/stocks/indices'),

  getTrending: () =>
    apiClient.get<StockQuote[]>('/stocks/trending'),

  getScreener: () =>
    apiClient.get<any[]>('/stocks/screener'),

  portfolioMimic: (investorId: string, budget: number, ethicsEnabled?: boolean) =>
    apiClient.post<{
      investor: string;
      investorName: string;
      budget: number;
      holdings: Array<{
        ticker: string;
        name: string;
        allocation: number;
        price: number;
        shares: number;
        value: number;
      }>;
      totalValue: number;
      cashRemaining: number;
      ethicsApplied: boolean;
      replacedTickers: Array<{ old: string; new: string; reason: string }>;
    }>('/portfolio/mimic', { investorId, budget, ethicsEnabled }),
};

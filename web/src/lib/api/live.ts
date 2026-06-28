import { apiClient } from './client';

export interface LiveSnapshot {
  ticker: string;
  name: string | null;
  sector: string | null;
  score: number | null;
  signal: 'buy' | 'hold' | 'sell' | null;
  price: number | null;
  changePct: number | null;
  pillars: Record<string, number> | null;
  updatedAt: string;
}

export type AlertSeverity = 'notable' | 'big' | 'extreme';

export interface LiveAlert {
  ticker: string;
  name: string | null;
  severity: AlertSeverity;
  direction: 'up' | 'down';
  changePct: number;
  price: number | null;
  score: number | null;
  headline: string | null;
  headlineUrl: string | null;
  createdAt: string;
}

export interface LiveFeed {
  snapshot: LiveSnapshot | null;
  alerts: LiveAlert[];
}

export interface MarketInsights {
  dataset: { snapshots: number; tickers: number; since: string | null };
  accuracy: { evaluated: number; hits: number; hitRate: number | null };
  topGainers: Array<{ ticker: string; trend: number }>;
  topLosers: Array<{ ticker: string; trend: number }>;
  mostAlerted: Array<{ ticker: string; count: number }>;
}

export const liveApi = {
  getFeed: () => apiClient.get<LiveFeed>('/live/feed'),
  getInsights: () => apiClient.get<MarketInsights>('/live/insights'),
};

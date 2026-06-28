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

export const liveApi = {
  getFeed: () => apiClient.get<LiveFeed>('/live/feed'),
};

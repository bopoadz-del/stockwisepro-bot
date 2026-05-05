import { apiClient } from './client';

export interface WatchlistItem {
  id: string;
  ticker: string;
  name: string;
  addedAt: string;
}

export const watchlistApi = {
  getAll: () =>
    apiClient.get<WatchlistItem[]>('/watchlist'),

  add: (ticker: string, name?: string) =>
    apiClient.post<WatchlistItem>('/watchlist', { ticker, name }),

  remove: (ticker: string) =>
    apiClient.delete(`/watchlist/${ticker}`),

  check: (ticker: string) =>
    apiClient.get<{ inWatchlist: boolean }>(`/watchlist/check/${ticker}`),
};

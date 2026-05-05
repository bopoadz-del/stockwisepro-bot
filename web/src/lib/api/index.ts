// API Client and Services
export { apiClient, useApiClient } from './client';

// Auth API
export { authApi } from './auth';
export type { User, LoginResponse, RegisterData, LoginData } from './auth';

// Stocks API
export { stocksApi } from './stocks';
export type { StockQuote, KeyMetrics, HistoricalPrice } from './stocks';

// Watchlist API
export { watchlistApi } from './watchlist';
export type { WatchlistItem } from './watchlist';

// Alerts API
export { alertsApi } from './alerts';
export type { PriceAlert, CreateAlertData } from './alerts';

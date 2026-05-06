// API Client and Services
export { apiClient } from './client';

// Auth API
export { authApi } from './auth';
export type { User, AuthResponse, RegisterData, LoginData } from './auth';

// Stocks API
export { stocksApi } from './stocks';
export type { StockQuote, KeyMetrics, HistoricalPrice } from './stocks';

// Watchlist API
export { watchlistApi } from './watchlist';
export type { WatchlistItem } from './watchlist';

// Alerts API
export { alertsApi } from './alerts';
export type { PriceAlert, CreateAlertData } from './alerts';

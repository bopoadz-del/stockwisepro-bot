import { Context } from 'telegraf';

export interface BotContext extends Context {
  state: {
    eventId?: number;
    ticker?: string;
    apiDuration?: number;
    success?: boolean;
    errorMessage?: string;
  };
}

export interface Stock {
  id?: number;
  ticker: string;
  name: string;
  price?: number;
  sector?: string;
  industry?: string;
  marketCap?: number;
}

export interface StockScore {
  ticker: string;
  score: number;
  metrics: Record<string, number>;
}

export interface PortfolioItem {
  id: number;
  ticker: string;
  shares: number;
  avgPrice: number;
  currentPrice?: number;
}

export interface InvestorProfile {
  id: string;
  name: string;
  description: string;
  style: string;
}

export interface AnalyticsEvent {
  id?: number;
  telegramId: number;
  command: string;
  ticker?: string | null;
  rawInput?: string | null;
  apiResponseTimeMs?: number | null;
  success: boolean;
  errorMessage?: string | null;
  createdAt?: string;
}

export interface UserProfile {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  linkedStockwiseUserId?: number | null;
  createdAt: string;
}

export interface OpenBoxResult {
  finalScore: number;
  pillars: {
    fundamentals: number;
    marketDynamics: number;
    balanceSheet: number;
    leadership: number;
    innovation: number;
    ethics: number;
  };
  riskFlags: string[];
  narrative: string;
  ethicsPass: boolean;
  adjustments: {
    peerDelta: number;
    dominanceBonus: number;
  };
}

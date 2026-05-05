export interface Stock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  peRatio: number;
  pbRatio: number;
  psRatio: number;
  dividendYield: number;
  sector: string;
  score: number;
  signal: 'buy' | 'hold' | 'sell';
  sparklineData: number[];
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  avgVolume: number;
}

export interface ScoringCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  metrics: Metric[];
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  score: number;
  unit?: string;
}

export interface Investor {
  id: string;
  name: string;
  title: string;
  description: string;
  strategy: string;
  topHoldings: PortfolioHolding[];
  allocation: Record<string, number>;
  image?: string;
  color: string;
}

export interface PortfolioHolding {
  ticker: string;
  name: string;
  allocation: number;
  shares?: number;
  price?: number;
}

export interface UserPortfolio {
  budget: number;
  investorId: string;
  holdings: PortfolioHolding[];
  totalValue: number;
  cashRemaining: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  avatar?: string;
  rating: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export type SignalType = 'buy' | 'hold' | 'sell';

export interface ScoringWeights {
  valuation: number;
  profitability: number;
  growth: number;
  financialHealth: number;
  momentum: number;
}

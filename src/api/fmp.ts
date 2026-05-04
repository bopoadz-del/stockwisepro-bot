import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const BASE = 'https://financialmodelingprep.com/stable';

export interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  avgVolume: number;
  volume: number;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
  earningsAnnouncement: string;
  sharesOutstanding: number;
  timestamp: number;
}

export interface FMPKeyMetrics {
  symbol: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  marketCap: number;
  currentRatio: number;
  debtToEquity: number;
  roe: number;
  priceToBookRatio: number;
  priceToSalesRatio: number;
  dividendYield: number;
  payoutRatio: number;
  grahamNumber: number;
  peRatio: number;
  pbRatio: number;
  freeCashFlowPerShare: number;
  debtToAssets: number;
  netDebtToEBITDA: number;
  interestCoverage: number;
  returnOnAssets: number;
  returnOnEquity: number;
  returnOnCapitalEmployed: number;
  earningsYield: number;
  freeCashFlowYield: number;
  capexToRevenue: number;
  capexToDepreciation: number;
  revenueGrowth: number;
  netIncomeGrowth: number;
  freeCashFlowGrowth: number;
  grossProfitMargin: number;
  ebitdaMargin: number;
  operatingProfitMargin: number;
  netProfitMargin: number;
  [key: string]: number | string | undefined;
}

export interface FMPRating {
  symbol: string;
  date: string;
  rating: string;
  ratingScore: number;
  ratingRecommendation: string;
  ratingDetailsDCFScore: number;
  ratingDetailsDCFRecommendation: string;
  ratingDetailsROEScore: number;
  ratingDetailsROERecommendation: string;
  ratingDetailsROAScore: number;
  ratingDetailsROARecommendation: string;
  ratingDetailsDEScore: number;
  ratingDetailsDERecommendation: string;
  ratingDetailsPEScore: number;
  ratingDetailsPERecommendation: string;
  ratingDetailsPBScore: number;
  ratingDetailsPBRecommendation: string;
}

export interface FMPDCF {
  symbol: string;
  date: string;
  dcf: number;
  'Stock Price': number;
}

export interface FMPInsiderTrade {
  symbol: string;
  filingDate: string;
  transactionDate: string;
  reportingCik: string;
  companyCik: string;
  transactionType: string;
  securitiesOwned: number;
  reportingName: string;
  typeOfOwner: string;
  acquisitionOrDisposition: string;
  directOrIndirect: string;
  formType: string;
  securitiesTransacted: number;
  price: number;
  securityName: string;
  url: string;
}

class FMPClient {
  public readonly enabled: boolean;

  constructor() {
    this.enabled = !!config.fmpApiKey;
    if (!this.enabled) {
      logger.info('FMP client disabled (no FMP_API_KEY)');
    } else {
      logger.info('FMP client initialized');
    }
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const res = await axios.get<T>(`${BASE}${path}`, {
        params: { ...params, apikey: config.fmpApiKey },
        timeout: 10000,
      });
      return res.data;
    } catch (err) {
      logger.warn('FMP request failed', { path, error: String(err) });
      return null;
    }
  }

  async getQuote(symbol: string): Promise<FMPQuote | null> {
    const data = await this.get<FMPQuote[]>('/quote', { symbol: symbol.toUpperCase() });
    return data?.[0] || null;
  }

  async getKeyMetrics(symbol: string): Promise<FMPKeyMetrics | null> {
    const data = await this.get<FMPKeyMetrics[]>('/key-metrics-ttm', { symbol: symbol.toUpperCase() });
    return data?.[0] || null;
  }

  async getRatings(symbol: string): Promise<FMPRating | null> {
    const data = await this.get<FMPRating[]>('/ratings-snapshot', { symbol: symbol.toUpperCase() });
    return data?.[0] || null;
  }

  async getDCF(symbol: string): Promise<FMPDCF | null> {
    const data = await this.get<FMPDCF[]>('/discounted-cash-flow', { symbol: symbol.toUpperCase() });
    return data?.[0] || null;
  }

  async getInsiderTrading(symbol: string, limit = 20): Promise<FMPInsiderTrade[]> {
    const data = await this.get<FMPInsiderTrade[]>('/insider-trading/search', {
      symbol: symbol.toUpperCase(),
      page: 0,
      limit,
    });
    return data || [];
  }
}

export const fmp = new FMPClient();

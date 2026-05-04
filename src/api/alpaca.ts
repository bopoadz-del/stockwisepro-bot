import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  crypto_status?: string;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: string;
  qty: string;
  qty_available: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaTrade {
  symbol: string;
  trade: {
    t: string;
    x: string;
    p: number;
    s: number;
    c: string[];
    i: number;
    z: string;
  };
}

export interface AlpacaAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
  price?: number;
}

class AlpacaClient {
  private client: AxiosInstance | null = null;
  private dataClient: AxiosInstance | null = null;
  private brokerClient: AxiosInstance | null = null;
  public readonly enabled: boolean;
  private mode: 'trading' | 'broker' | 'none' = 'none';

  constructor() {
    const keyId = config.alpacaApiKey;
    const secretKey = config.alpacaSecretKey;
    this.enabled = !!(keyId && secretKey);

    if (!this.enabled) {
      logger.info('Alpaca client disabled (no ALPACA_API_KEY / ALPACA_SECRET_KEY)');
      return;
    }

    // Only use Broker API mode if explicitly requested (no env var set)
    // Trading API keys can also be 20+ chars, so length-based detection is wrong
    const useBroker = process.env.ALPACA_BROKER_MODE === 'true';

    if (useBroker) {
      // Broker API: uses Basic Auth on broker-api.sandbox.alpaca.markets
      const auth = Buffer.from(keyId + ':' + secretKey).toString('base64');
      this.brokerClient = axios.create({
        baseURL: 'https://broker-api.sandbox.alpaca.markets',
        headers: { Authorization: 'Basic ' + auth },
        timeout: 10000,
      });
      this.mode = 'broker';
      logger.info('Alpaca client initialized in Broker API mode');
    } else {
      // Trading API: uses APCA-API-KEY-ID headers
      const baseURL = config.alpacaPaper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';

      const headers = {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      };

      this.client = axios.create({
        baseURL,
        headers,
        timeout: 10000,
      });

      this.dataClient = axios.create({
        baseURL: 'https://data.alpaca.markets',
        headers,
        timeout: 10000,
      });

      this.mode = 'trading';
      logger.info('Alpaca client initialized in Trading API mode', { paper: config.alpacaPaper });
    }
  }

  async getAccount(): Promise<AlpacaAccount | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.get('/v2/account');
      return res.data as AlpacaAccount;
    } catch (err) {
      logger.error('Alpaca getAccount failed', { error: String(err) });
      return null;
    }
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    if (!this.client) return [];
    try {
      const res = await this.client.get('/v2/positions');
      return (res.data || []) as AlpacaPosition[];
    } catch (err) {
      logger.error('Alpaca getPositions failed', { error: String(err) });
      return [];
    }
  }

  async getLatestTrade(symbol: string): Promise<number> {
    const upper = symbol.toUpperCase();

    // Trading API path
    if (this.dataClient) {
      try {
        const res = await this.dataClient.get(`/v2/stocks/${upper}/trades/latest`);
        const trade = (res.data as AlpacaTrade)?.trade;
        if (trade && trade.p > 0) return trade.p;
      } catch (err) {
        logger.warn('Alpaca data API getLatestTrade failed', { symbol: upper, error: String(err) });
      }
    }

    // Broker API path: use /v1/assets/{symbol}
    if (this.brokerClient) {
      try {
        const res = await this.brokerClient.get(`/v1/assets/${upper}`);
        const asset = res.data as AlpacaAsset;
        // Broker API assets don't always have price; try alternate endpoint or skip
        logger.info('Alpaca broker asset fetched', { symbol: upper, exchange: asset.exchange });
      } catch (err) {
        logger.warn('Alpaca broker API getAsset failed', { symbol: upper, error: String(err) });
      }
    }

    return 0;
  }

  async getAsset(symbol: string): Promise<AlpacaAsset | null> {
    if (!this.brokerClient) return null;
    const upper = symbol.toUpperCase();
    try {
      const res = await this.brokerClient.get(`/v1/assets/${upper}`);
      return res.data as AlpacaAsset;
    } catch (err) {
      logger.warn('Alpaca broker getAsset failed', { symbol: upper, error: String(err) });
      return null;
    }
  }
}

export const alpaca = new AlpacaClient();

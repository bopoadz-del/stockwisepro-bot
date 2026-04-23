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

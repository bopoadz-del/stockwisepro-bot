import cron from 'node-cron';
import { stockwise } from '../api/stockwise';
import { getActiveAlerts, deactivateAlert } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import YahooFinance from 'yahoo-finance2';
import { getQuote, setQuote } from './cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Fetch live prices for multiple tickers, deduping and adding delays to avoid Yahoo 429s */
async function fetchPricesForAlerts(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];

  for (const ticker of uniqueTickers) {
    // 1. Try cache first (Redis/Upstash or in-memory)
    const cached = await getQuote(ticker);
    if (cached && cached.price > 0) {
      prices.set(ticker, cached.price);
      continue;
    }

    // 2. Try StockWise API
    try {
      const { data, error } = await stockwise.getStock(ticker);
      if (!error && data?.price) {
        const p = parseFloat(data.price);
        if (p > 0) {
          prices.set(ticker, p);
          await setQuote({ ticker, price: p, timestamp: Date.now() });
          continue;
        }
      }
    } catch {
      // ignore StockWise errors
    }

    // 3. Fallback to Yahoo Finance with delay to avoid rate limiting
    try {
      const summary = await yf.quoteSummary(ticker, { modules: ['price'] });
      const p = (summary as any)?.price?.regularMarketPrice;
      if (p && Number(p) > 0) {
        const priceNum = Number(p);
        prices.set(ticker, priceNum);
        await setQuote({ ticker, price: priceNum, timestamp: Date.now() });
      }
    } catch (err) {
      logger.warn(`Alert check: Yahoo price failed for ${ticker}`, { error: (err as Error).message });
    }

    // Small delay between Yahoo requests to avoid 429 rate limits
    if (uniqueTickers.length > 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return prices;
}

export function startAlertService(bot: Telegraf<BotContext>) {
  const interval = config.alertCheckIntervalMinutes;
  logger.info(`Starting alert service (every ${interval} minutes)`);

  const task = cron.schedule(`*/${interval} * * * *`, async () => {
    logger.info('Checking price alerts...');
    const alerts = getActiveAlerts();
    if (alerts.length === 0) {
      logger.info('No active alerts to check');
      return;
    }

    // Batch-fetch prices for unique tickers to minimize API calls
    const tickers = alerts.map(a => a.ticker);
    const prices = await fetchPricesForAlerts(tickers);

    for (const alert of alerts) {
      try {
        const price = prices.get(alert.ticker.toUpperCase()) ?? null;
        if (price === null) {
          logger.warn(`Alert check: no price available for ${alert.ticker}`);
          continue;
        }
        const target = alert.target_price;
        const triggered =
          (alert.condition === 'above' && price >= target) ||
          (alert.condition === 'below' && price <= target);

        if (triggered) {
          try {
            await bot.telegram.sendMessage(
              alert.telegram_id,
              `🔔 *Alert Triggered!*\n\n*${alert.ticker}* is now *$${price}* (${alert.condition} $${target})`,
              { parse_mode: 'Markdown' }
            );
            deactivateAlert(alert.id);
            logger.info(`Alert triggered: ${alert.ticker} ${alert.condition} ${target}`);
          } catch (sendErr) {
            const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            logger.error('Failed to send alert notification', { alertId: alert.id, error: errMsg });
            // Do NOT deactivate if we couldn't notify the user
          }
        }
      } catch (err) {
        logger.error('Alert processing error', { alertId: alert.id, error: (err as Error).message });
      }
    }
  });

  return task;
}

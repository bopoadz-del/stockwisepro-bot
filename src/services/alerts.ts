import cron from 'node-cron';
import { stockwise } from '../api/stockwise';
import { getActiveAlerts, deactivateAlert } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function getLivePrice(ticker: string): Promise<number | null> {
  // Try StockWise API first
  const { data, error } = await stockwise.getStock(ticker);
  if (!error && data?.price) {
    const p = parseFloat(data.price);
    if (p > 0) return p;
  }
  // Fallback to Yahoo Finance
  try {
    const summary = await yf.quoteSummary(ticker, { modules: ['price'] });
    const p = (summary as any)?.price?.regularMarketPrice;
    if (p && Number(p) > 0) return Number(p);
  } catch {
    // ignore
  }
  return null;
}

export function startAlertService(bot: Telegraf<BotContext>) {
  const interval = config.alertCheckIntervalMinutes;
  logger.info(`Starting alert service (every ${interval} minutes)`);

  const task = cron.schedule(`*/${interval} * * * *`, async () => {
    logger.info('Checking price alerts...');
    const alerts = getActiveAlerts();

    for (const alert of alerts) {
      try {
        const price = await getLivePrice(alert.ticker);
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

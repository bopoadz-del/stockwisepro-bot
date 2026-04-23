import cron from 'node-cron';
import { stockwise } from '../api/stockwise';
import { getActiveAlerts, deactivateAlert } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types';

export function startAlertService(bot: Telegraf<BotContext>) {
  const interval = config.alertCheckIntervalMinutes;
  logger.info(`Starting alert service (every ${interval} minutes)`);

  const task = cron.schedule(`*/${interval} * * * *`, async () => {
    logger.info('Checking price alerts...');
    const alerts = getActiveAlerts();

    for (const alert of alerts) {
      try {
        const { data, error } = await stockwise.getStock(alert.ticker);
        if (error || !data || !data.price) {
          logger.warn(`Alert check failed for ${alert.ticker}`, { error });
          continue;
        }

        const price = parseFloat(data.price);
        const target = alert.target_price;
        const triggered =
          (alert.condition === 'above' && price >= target) ||
          (alert.condition === 'below' && price <= target);

        if (triggered) {
          await bot.telegram.sendMessage(
            alert.telegram_id,
            `🔔 *Alert Triggered!*\n\n*${alert.ticker}* is now *$${price}* (${alert.condition} $${target})`,
            { parse_mode: 'Markdown' }
          );
          deactivateAlert(alert.id);
          logger.info(`Alert triggered: ${alert.ticker} ${alert.condition} ${target}`);
        }
      } catch (err) {
        logger.error('Alert processing error', { alertId: alert.id, error: (err as Error).message });
      }
    }
  });

  return task;
}

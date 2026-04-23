import { Telegraf } from 'telegraf';
import { config } from './config';
import { initDb } from './db';
import { stockwise } from './api/stockwise';
import { logger } from './utils/logger';
import { analyticsMiddleware } from './middleware/analytics';
import { registerCommands } from './commands';
import { registerScenes } from './scenes';
import { startAlertService } from './services/alerts';
import { BotContext } from './types';

async function main() {
  try {
    // Init database
    initDb();

    // Authenticate with StockWisePro API (optional)
    await stockwise.authenticateAsBot();

    // Create bot
    const bot = new Telegraf<BotContext>(config.telegramToken);

    // Middleware
    bot.use(analyticsMiddleware());

    // Register scenes & commands
    registerScenes(bot);
    registerCommands(bot);

    // Start alert cron
    startAlertService(bot);

    // Error handler
    bot.catch((err, ctx) => {
      logger.error('Bot error', { error: (err as Error).message, updateType: ctx.updateType });
      ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
    });

    // Launch
    logger.info('Starting StockWiseBot...');
    await bot.launch();

    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (err) {
    logger.error('Fatal startup error', { error: (err as Error).message });
    process.exit(1);
  }
}

main();

import { Telegraf } from 'telegraf';
import http from 'http';
import { config } from './config';
import { initDb } from './db';
import { stockwise } from './api/stockwise';
import { logger } from './utils/logger';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { analyticsMiddleware } from './middleware/analytics';
import { registerCommands } from './commands';
import { registerScenes } from './scenes';
import { startAlertService } from './services/alerts';
import { BotContext } from './types';

async function main() {
  try {
    logger.info('=== StockWiseBot starting ===');
    logger.info('Node version: ' + process.version);
    logger.info('Environment: ' + config.nodeEnv);

    logger.info('Step 1: Initializing database...');
    initDb();
    logger.info('Step 1: Database OK');

    logger.info('Step 2: Authenticating with StockWisePro API...');
    await stockwise.authenticateAsBot();
    logger.info('Step 2: API auth OK (or skipped)');

    logger.info('Step 3: Creating Telegraf bot...');
    const bot = new Telegraf<BotContext>(config.telegramToken);
    logger.info('Step 3: Bot instance created');

    logger.info('Step 4: Attaching middleware...');
    bot.use(rateLimitMiddleware);
    bot.use(analyticsMiddleware());
    logger.info('Step 4: Middleware attached');

    logger.info('Step 5: Registering scenes & commands...');
    registerScenes(bot);
    registerCommands(bot);
    logger.info('Step 5: Commands registered');

    // Health-check command
    bot.command('ping', async (ctx) => {
      await ctx.reply('🏓 Pong! Bot is alive.');
    });

    logger.info('Step 6: Starting alert service...');
    const alertTask = startAlertService(bot);
    logger.info('Step 6: Alert service started');

    logger.info('Step 7: Starting health check server...');
    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    healthServer.listen(3000, () => {
      logger.info('Health check server listening on port 3000');
    });

    logger.info('Step 8: Launching bot...');
    await bot.launch();
    logger.info('Step 8: Bot is polling Telegram successfully');

    process.once('SIGINT', () => {
      logger.info('Shutting down (SIGINT)...');
      alertTask.stop();
      healthServer.close();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      logger.info('Shutting down (SIGTERM)...');
      alertTask.stop();
      healthServer.close();
      bot.stop('SIGTERM');
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    logger.error('Fatal startup error', { error: errorMessage, stack });
    process.exit(1);
  }
}

main();

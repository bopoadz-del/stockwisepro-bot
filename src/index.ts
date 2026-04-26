import { Telegraf } from 'telegraf';
import http from 'http';
import { config } from './config';
import { initDb, flushAnalytics } from './db';
import { stockwise } from './api/stockwise';
import { databento } from './api/databento';
import { isCacheAvailable } from './services/cache';
import { logger } from './utils/logger';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { analyticsMiddleware } from './middleware/analytics';
import { registerCommands } from './commands';
import { registerScenes } from './scenes';
import { startAlertService } from './services/alerts';
import { startLearningReportService } from './services/learning';
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

    logger.info('Step 2b: Initializing market data adapters...');
    if (databento.enabled) {
      logger.info('Databento adapter enabled');
    } else {
      logger.info('Databento adapter disabled (no DATABENTO_API_KEY)');
    }
    if (isCacheAvailable()) {
      logger.info('Redis cache connected');
    } else {
      logger.info('Redis cache unavailable (using in-memory fallback)');
    }
    logger.info('Step 2b: Market data adapters OK');

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

    logger.info('Step 6b: Starting learning report service...');
    const learningTask = startLearningReportService(bot);
    logger.info('Step 6b: Learning report service started');

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
    healthServer.listen(config.healthPort, () => {
      logger.info(`Health check server listening on port ${config.healthPort}`);
    });

    logger.info('Step 8: Launching bot...');
    try {
      await bot.launch();
    } catch (launchErr) {
      const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        throw new Error(
          'Telegram refused the bot token (401 Unauthorized). ' +
          'The token may be invalid, revoked, or expired. ' +
          'Please regenerate a new token via @BotFather and update the TELEGRAM_BOT_TOKEN environment variable.'
        );
      }
      throw launchErr;
    }
    logger.info('Step 8: Bot is polling Telegram successfully');

    process.once('SIGINT', () => {
      logger.info('Shutting down (SIGINT)...');
      flushAnalytics();
      alertTask.stop();
      learningTask.stop();
      healthServer.close();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      logger.info('Shutting down (SIGTERM)...');
      flushAnalytics();
      alertTask.stop();
      learningTask.stop();
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

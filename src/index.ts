import { Telegraf } from 'telegraf';
import { createWebServer } from './web/server';
import { config } from './config';
import { initDb, flushAnalytics } from './db';
import { stockwise } from './api/stockwise';
import { databento } from './api/databento';
import { isCacheAvailable } from './services/cache';
import { logger } from './utils/logger';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { analyticsMiddleware } from './middleware/analytics';
import { i18nMiddleware } from './middleware/i18n';
import { t } from './i18n';
import { getUserLanguage } from './db';
import { registerCommands } from './commands';
import { registerScenes } from './scenes';
import { startAlertService } from './services/alerts';
import { startLearningReportService } from './services/learning';
import { startLiveFeedService } from './services/livefeed';
import { getLocalMimicAllocation } from './services/mimic';
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

    // The web server is started before the bot and does not depend on it. It used
    // to start at Step 7, after Telegraf was constructed at Step 3 — and Telegraf
    // throws on an empty token, so a missing token meant the outer catch called
    // process.exit(1) and the website never came up at all.
    logger.info('Step 2c: Starting web server (independent of the bot)...');
    const webApp = createWebServer();
    const webServer = webApp.listen(config.port, () => {
      logger.info(`Web server listening on port ${config.port}`);
    });

    // Global crash handlers for silent failures
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { error: String(reason) });
    });

    if (!config.telegramToken) {
      logger.warn(
        'Step 3: TELEGRAM_BOT_TOKEN is not set — skipping the Telegram bot entirely. ' +
        'The web server and API are running. Set TELEGRAM_BOT_TOKEN to enable the bot.'
      );
      // The live score feed drives the website's hero card, not just Telegram.
      // startLiveFeedService takes the bot optionally and null-guards every send,
      // so it runs here and the card gets data even with no bot configured.
      logger.info('Starting live score feed service (no bot; web only)...');
      const liveFeedOnly = startLiveFeedService();

      const shutdownWebOnly = (signal: string) => {
        logger.info(`Shutting down (${signal})...`);
        flushAnalytics();
        liveFeedOnly.stop();
        webServer.close();
      };
      process.once('SIGINT', () => shutdownWebOnly('SIGINT'));
      process.once('SIGTERM', () => shutdownWebOnly('SIGTERM'));
      return;
    }

    logger.info('Step 3: Creating Telegraf bot...');
    const bot = new Telegraf<BotContext>(config.telegramToken);
    logger.info('Step 3: Bot instance created');

    logger.info('Step 4: Attaching middleware...');
    bot.use(rateLimitMiddleware);
    bot.use(i18nMiddleware());
    bot.use(analyticsMiddleware());
    logger.info('Step 4: Middleware attached');

    logger.info('Step 5: Registering scenes & commands...');
    registerScenes(bot);
    registerCommands(bot);
    logger.info('Step 5: Commands registered');

    // Global error handler
    bot.catch((err, ctx) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : 'No stack';
      const userId = ctx.from?.id;
      logger.error('Bot error', { error: errorMessage, stack, updateType: ctx.updateType, userId });
      // Show stack trace to admin for debugging
      if (userId && config.adminTelegramIds.includes(String(userId))) {
        const shortStack = stack ? stack.split('\n').slice(0, 4).join('\n') : 'No stack';
        ctx.reply(`❌ Error: ${errorMessage}\n\n\`\`\`${shortStack}\`\`\``).catch(() => { });
      } else {
        const lang = userId ? getUserLanguage(userId) : 'en';
        ctx.reply(t(lang, 'common.error')).catch(() => { });
      }
    });

    // Health-check command
    bot.command('ping', async (ctx) => {
      await ctx.reply(t(getUserLanguage(ctx.from?.id ?? 0), 'common.ping'));
    });

    logger.info('Step 6: Starting alert service...');
    const alertTask = startAlertService(bot);
    logger.info('Step 6: Alert service started');

    logger.info('Step 6b: Starting learning report service...');
    const learningTask = startLearningReportService(bot);
    logger.info('Step 6b: Learning report service started');

    logger.info('Step 6c: Starting live score feed service...');
    const liveFeedTask = startLiveFeedService(bot);
    logger.info('Step 6c: Live score feed service started');

    logger.info('Step 8: Launching bot...');
    let launchRetries = 0;
    const maxLaunchRetries = 10;
    let botLaunched = false;
    while (launchRetries < maxLaunchRetries) {
      try {
        await bot.launch();
        botLaunched = true;
        break;
      } catch (launchErr) {
        const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          logger.error(
            'Telegram refused the bot token (401 Unauthorized). ' +
            'The token may be invalid, revoked, or expired. ' +
            'Please regenerate a new token via @BotFather and update the TELEGRAM_BOT_TOKEN environment variable.'
          );
          break;
        }
        if (msg.includes('409') || msg.includes('Conflict')) {
          launchRetries++;
          if (launchRetries >= maxLaunchRetries) {
            logger.error(
              'Another bot instance is already running with this token (409 Conflict). ' +
              'Web server will continue running, but Telegram bot will not receive messages until the conflict is resolved.'
            );
            break;
          }
          logger.warn(`Bot launch conflict (409), retrying in 15s... (${launchRetries}/${maxLaunchRetries})`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
        logger.error('Bot launch failed', { error: msg });
        break;
      }
    }
    if (botLaunched) {
      logger.info('Step 8: Bot is polling Telegram successfully');
    } else {
      logger.warn('Step 8: Bot launch failed or skipped. Web server is still running.');
    }

    // Register command menu with Telegram (non-blocking, 5s timeout)
    Promise.race([
      bot.telegram.setMyCommands([
        { command: 'start', description: 'Welcome message' },
        { command: 'help', description: 'Show all commands' },
        { command: 'search', description: 'Search stocks' },
        { command: 'score', description: 'AI scoring & metrics' },
        { command: 'simulate', description: 'Monte Carlo simulation' },
        { command: 'metrics', description: 'Risk stats (vol, Sharpe, VaR)' },
        { command: 'news', description: 'Latest news for a ticker' },
        { command: 'watchlist', description: 'View your watchlist' },
        { command: 'watchlist_add', description: 'Add stock to watchlist' },
        { command: 'watchlist_remove', description: 'Remove stock from watchlist' },
        { command: 'portfolio', description: 'View your portfolio' },
        { command: 'mimic', description: 'Copy investor strategy' },
        { command: 'experiment', description: 'Test custom formulas' },
        { command: 'alert', description: 'Set price alerts' },
        { command: 'alerts', description: 'View your alerts' },
        { command: 'marketalerts', description: 'Toggle big market-move alerts' },
        { command: 'insights', description: 'Market insights & signal accuracy' },
        { command: 'explain', description: 'AI explanation for a ticker' },
        { command: 'weights', description: 'Set scoring weights' },
        { command: 'weights_set', description: 'Configure scoring weights' },
        { command: 'alpaca', description: 'Alpaca trading info' },
        { command: 'dcf', description: 'DCF valuation' },
        { command: 'insider', description: 'Insider trading' },
        { command: 'language', description: 'Change language / تغيير اللغة' },
        { command: 'profile', description: 'View or set your profile (email)' },
        { command: 'cancel', description: 'Cancel pending action' },
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('setMyCommands timeout')), 5000)),
    ])
      .then(() => logger.info('Command menu registered with Telegram'))
      .catch((cmdErr) => logger.warn('Failed to register command menu', { error: String(cmdErr) }));

    process.once('SIGINT', () => {
      logger.info('Shutting down (SIGINT)...');
      flushAnalytics();
      alertTask.stop();
      learningTask.stop();
      liveFeedTask.stop();
      webServer.close();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      logger.info('Shutting down (SIGTERM)...');
      flushAnalytics();
      alertTask.stop();
      learningTask.stop();
      liveFeedTask.stop();
      webServer.close();
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

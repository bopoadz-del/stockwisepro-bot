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

    // Global error handler
    bot.catch((err, ctx) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : 'No stack';
      const userId = ctx.from?.id;
      logger.error('Bot error', { error: errorMessage, stack, updateType: ctx.updateType, userId });
      // Show stack trace to admin for debugging
      if (userId === 7761120195) {
        const shortStack = stack ? stack.split('\n').slice(0, 4).join('\n') : 'No stack';
        ctx.reply(`❌ Error: ${errorMessage}\n\n\`\`\`${shortStack}\`\`\``).catch(() => { });
      } else {
        ctx.reply('❌ Something went wrong. Please try again later.').catch(() => { });
      }
    });

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
    const healthServer = http.createServer(async (req, res) => {
      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // Local mimic API endpoint (self-contained fallback)
      if (req.url === '/api/portfolio/mimic' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const investorId = payload.investorId;
            const ethicsEnabled = !!payload.ethicsEnabled;

            if (!investorId || typeof investorId !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'investorId is required' }));
              return;
            }

            const result = getLocalMimicAllocation(investorId, ethicsEnabled);
            if (!result) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to build portfolio' }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              holdings: result.holdings,
              investorName: result.investorName,
              ethicsApplied: result.ethicsApplied,
              replacedTickers: result.replacedTickers || [],
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });
    healthServer.listen(config.healthPort, () => {
      logger.info(`Health check server listening on port ${config.healthPort}`);
    });

    logger.info('Step 8: Launching bot...');
    let launchRetries = 0;
    const maxLaunchRetries = 10;
    while (launchRetries < maxLaunchRetries) {
      try {
        await bot.launch();
        break;
      } catch (launchErr) {
        const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          throw new Error(
            'Telegram refused the bot token (401 Unauthorized). ' +
            'The token may be invalid, revoked, or expired. ' +
            'Please regenerate a new token via @BotFather and update the TELEGRAM_BOT_TOKEN environment variable.'
          );
        }
        if (msg.includes('409') || msg.includes('Conflict')) {
          launchRetries++;
          if (launchRetries >= maxLaunchRetries) {
            throw new Error(
              'Another bot instance is already running with this token (409 Conflict). ' +
              'If you have the bot deployed on Render or another server, stop the local instance ' +
              'or use a different TELEGRAM_BOT_TOKEN for development.'
            );
          }
          logger.warn(`Bot launch conflict (409), retrying in 15s... (${launchRetries}/${maxLaunchRetries})`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
        throw launchErr;
      }
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

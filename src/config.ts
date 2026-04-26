import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  stockwiseApiBaseUrl: process.env.STOCKWISE_API_BASE_URL || 'http://localhost:3001',
  stockwiseApiKey: process.env.STOCKWISE_API_KEY || '',
  braveApiKey: process.env.BRAVE_API_KEY || '',
  dataDir: process.env.DATA_DIR || './data',
  adminTelegramIds: (process.env.BOT_ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  alertCheckIntervalMinutes: Math.min(Math.max(parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES || '5', 10), 1), 60),
  stockwiseBotEmail: process.env.STOCKWISE_BOT_USER_EMAIL || '',
  stockwiseBotPassword: process.env.STOCKWISE_BOT_USER_PASSWORD || '',
  healthPort: parseInt(process.env.HEALTH_PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databentoApiKey: process.env.DATABENTO_API_KEY || '',
  redisUrl: process.env.REDIS_URL || '',
};

if (!config.telegramToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Basic Telegram bot token format validation: digits:alphanumeric
if (!/^\d+:[A-Za-z0-9_-]+$/.test(config.telegramToken)) {
  throw new Error(
    'TELEGRAM_BOT_TOKEN appears to be malformed. Expected format: <numbers>:<alphanumeric-string>. ' +
    'Please verify your token from @BotFather.'
  );
}

export const DB_PATH = path.resolve(config.dataDir, 'bot_analytics.db');

if (isNaN(config.healthPort) || config.healthPort < 1 || config.healthPort > 65535) {
  throw new Error('HEALTH_PORT must be a valid port number (1-65535)');
}

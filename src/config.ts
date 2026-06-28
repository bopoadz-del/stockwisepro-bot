import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const parsedInterval = parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES || '5', 10);
const alertInterval = Number.isNaN(parsedInterval) ? 5 : Math.min(Math.max(parsedInterval, 1), 60);

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  stockwiseApiBaseUrl: process.env.STOCKWISE_API_BASE_URL || 'https://stockwise-pro-api.onrender.com',
  stockwiseApiKey: process.env.STOCKWISE_API_KEY || '',
  braveApiKey: process.env.BRAVE_API_KEY || '',
  dataDir: process.env.DATA_DIR || './data',
  adminTelegramIds: (process.env.BOT_ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  alertCheckIntervalMinutes: alertInterval,
  stockwiseBotEmail: process.env.STOCKWISE_BOT_USER_EMAIL || '',
  stockwiseBotPassword: process.env.STOCKWISE_BOT_USER_PASSWORD || '',
  port: parseInt(process.env.PORT || process.env.HEALTH_PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databentoApiKey: process.env.DATABENTO_API_KEY || '',
  redisUrl: process.env.REDIS_URL || '',
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  alpacaApiKey: process.env.ALPACA_API_KEY || '',
  alpacaSecretKey: process.env.ALPACA_SECRET_KEY || '',
  alpacaPaper: (process.env.ALPACA_PAPER || 'true').toLowerCase() === 'true',
  fmpApiKey: process.env.FMP_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || '',
  sessionSecret: process.env.SESSION_SECRET || process.env.JWT_SECRET || '',
  webCorsOrigins: (process.env.WEB_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  websiteUrl: process.env.WEBSITE_URL || 'https://stockwisepro-bot-pzi2.onrender.com',
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

if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT/HEALTH_PORT must be a valid port number (1-65535)');
}

if (!config.sessionSecret) {
  throw new Error('SESSION_SECRET (or JWT_SECRET) is required. Generate one with: openssl rand -base64 48');
}

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  stockwiseApiBaseUrl: process.env.STOCKWISE_API_BASE_URL || 'http://localhost:3001',
  stockwiseApiKey: process.env.STOCKWISE_API_KEY || '',
  dataDir: process.env.DATA_DIR || './data',
  adminTelegramIds: (process.env.BOT_ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  alertCheckIntervalMinutes: parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES || '5', 10),
  stockwiseBotEmail: process.env.STOCKWISE_BOT_USER_EMAIL || '',
  stockwiseBotPassword: process.env.STOCKWISE_BOT_USER_PASSWORD || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};

if (!config.telegramToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

export const DB_PATH = path.resolve(config.dataDir, 'bot_analytics.db');

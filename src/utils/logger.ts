import fs from 'fs';
import path from 'path';

const LOG_FILE = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'bot.log') : './bot.log';

function writeToFile(level: string, msg: string, meta?: Record<string, unknown>) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${msg} ${meta ? JSON.stringify(meta) : ''}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Silent fail if disk isn't ready
  }
}

export function userSafeError(): string {
  return '❌ Something went wrong. Please try again later.';
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    console.log(`[INFO] ${new Date().toISOString()} ${msg}`, meta ? JSON.stringify(meta) : '');
    writeToFile('INFO', msg, meta);
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, meta ? JSON.stringify(meta) : '');
    writeToFile('ERROR', msg, meta);
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, meta ? JSON.stringify(meta) : '');
    writeToFile('WARN', msg, meta);
  },
};

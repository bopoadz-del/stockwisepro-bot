import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR) : '.';
const LOG_FILE = path.join(LOG_DIR, 'bot.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size >= MAX_LOG_SIZE) {
        const rotated = `${LOG_FILE}.${Date.now()}`;
        fs.renameSync(LOG_FILE, rotated);
        // Keep only last 5 rotated logs
        const files = fs.readdirSync(LOG_DIR)
          .filter(f => f.startsWith('bot.log.'))
          .sort();
        while (files.length > 5) {
          const old = files.shift();
          if (old) fs.unlinkSync(path.join(LOG_DIR, old));
        }
      }
    }
  } catch {
    // Silent fail
  }
}

function writeToFile(level: string, msg: string, meta?: Record<string, unknown>) {
  try {
    rotateLogIfNeeded();
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

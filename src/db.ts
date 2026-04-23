import Database, { Database as DatabaseType } from 'better-sqlite3';
import { DB_PATH } from './config';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

export function initDb() {
  logger.info('Initializing SQLite database...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      linked_stockwise_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      command TEXT NOT NULL,
      ticker TEXT,
      raw_input TEXT,
      api_response_time_ms INTEGER,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_events_telegram_id ON analytics_events(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_events_command ON analytics_events(command);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON analytics_events(created_at);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      event_id INTEGER,
      rating INTEGER CHECK(rating BETWEEN -1 AND 1),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES analytics_events(id)
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      target_price REAL NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
      is_active INTEGER NOT NULL DEFAULT 1,
      triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active);
  `);

  logger.info('Database initialized.');
}

export function ensureUser(telegramId: number, username?: string, firstName?: string, lastName?: string) {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, last_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name
  `);
  stmt.run(telegramId, username || null, firstName || null, lastName || null);
}

export function logEvent(event: {
  telegramId: number;
  command: string;
  ticker?: string;
  rawInput?: string;
  apiResponseTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO analytics_events (telegram_id, command, ticker, raw_input, api_response_time_ms, success, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    event.telegramId,
    event.command,
    event.ticker || null,
    event.rawInput || null,
    event.apiResponseTimeMs || null,
    event.success !== false ? 1 : 0,
    event.errorMessage || null
  );
}

export function saveFeedback(telegramId: number, eventId: number | null, rating: number, comment?: string) {
  const stmt = db.prepare(`
    INSERT INTO feedback (telegram_id, event_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(telegramId, eventId, rating, comment || null);
}

export function addAlert(telegramId: number, ticker: string, targetPrice: number, condition: 'above' | 'below') {
  const stmt = db.prepare(`
    INSERT INTO price_alerts (telegram_id, ticker, target_price, condition)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(telegramId, ticker.toUpperCase(), targetPrice, condition);
}

export function getActiveAlerts() {
  return db.prepare(`SELECT * FROM price_alerts WHERE is_active = 1`).all() as Array<{
    id: number;
    telegram_id: number;
    ticker: string;
    target_price: number;
    condition: string;
  }>;
}

export function deactivateAlert(alertId: number) {
  db.prepare(`UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`).run(alertId);
}

export function getUserAlerts(telegramId: number) {
  return db.prepare(`SELECT * FROM price_alerts WHERE telegram_id = ? ORDER BY created_at DESC`).all(telegramId) as Array<{
    id: number;
    ticker: string;
    target_price: number;
    condition: string;
    is_active: number;
    created_at: string;
  }>;
}

export function getAnalyticsSummary(days = 7) {
  const totalUsers = db.prepare(`SELECT COUNT(DISTINCT telegram_id) as count FROM users`).get() as { count: number };
  const totalEvents = db.prepare(`SELECT COUNT(*) as count FROM analytics_events WHERE created_at >= datetime('now', '-${days} days')`).get() as { count: number };
  const commandStats = db.prepare(`
    SELECT command, COUNT(*) as count FROM analytics_events
    WHERE created_at >= datetime('now', '-${days} days')
    GROUP BY command ORDER BY count DESC
  `).all() as Array<{ command: string; count: number }>;
  const topTickers = db.prepare(`
    SELECT ticker, COUNT(*) as count FROM analytics_events
    WHERE ticker IS NOT NULL AND created_at >= datetime('now', '-${days} days')
    GROUP BY ticker ORDER BY count DESC LIMIT 20
  `).all() as Array<{ ticker: string; count: number }>;

  return { totalUsers, totalEvents, commandStats, topTickers };
}

export function exportAnalyticsCsv(days = 30): string {
  const rows = db.prepare(`
    SELECT ae.*, u.username, u.first_name
    FROM analytics_events ae
    LEFT JOIN users u ON ae.telegram_id = u.telegram_id
    WHERE ae.created_at >= datetime('now', '-${days} days')
    ORDER BY ae.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const val = row[h];
      if (val == null) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
    }).join(','))
  ].join('\n');

  return csv;
}

export { db };

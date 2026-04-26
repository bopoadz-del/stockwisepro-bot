import Database, { Database as DatabaseType } from 'better-sqlite3';
import { DB_PATH } from './config';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

let db: DatabaseType;

function ensureDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
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

      CREATE TABLE IF NOT EXISTS user_weights (
        telegram_id INTEGER PRIMARY KEY,
        valuation INTEGER NOT NULL DEFAULT 75,
        profitability INTEGER NOT NULL DEFAULT 85,
        growth INTEGER NOT NULL DEFAULT 70,
        financial_health INTEGER NOT NULL DEFAULT 80,
        momentum INTEGER NOT NULL DEFAULT 50,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS nl_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        raw_message TEXT NOT NULL,
        detected_intent TEXT,
        extracted_ticker TEXT,
        executed_command TEXT,
        is_fallback INTEGER NOT NULL DEFAULT 0,
        user_corrected_intent TEXT,
        user_feedback INTEGER CHECK(user_feedback BETWEEN -1 AND 1),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_nl_logs_telegram_id ON nl_logs(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_nl_logs_intent ON nl_logs(detected_intent);
      CREATE INDEX IF NOT EXISTS idx_nl_logs_fallback ON nl_logs(is_fallback);
      CREATE INDEX IF NOT EXISTS idx_nl_logs_created_at ON nl_logs(created_at);
    `,
  },
];

export function initDb() {
  logger.info('Initializing SQLite database...');
  const conn = ensureDb();

  // Migration tracking
  conn.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedVersions = new Set(
    (conn.prepare('SELECT version FROM _migrations').all() as Array<{ version: number }>).map(r => r.version)
  );

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      logger.info(`Applying migration ${migration.version}...`);
      conn.exec(migration.sql);
      conn.prepare('INSERT INTO _migrations (version) VALUES (?)').run(migration.version);
      logger.info(`Migration ${migration.version} applied.`);
    }
  }

  logger.info('Database initialized.');
}

export function ensureUser(telegramId: number, username?: string, firstName?: string, lastName?: string) {
  const conn = ensureDb();
  const stmt = conn.prepare(`
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
  try {
    const conn = ensureDb();
    const stmt = conn.prepare(`
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
  } catch (err) {
    logger.warn('logEvent failed (non-fatal)', { error: (err as Error).message });
    return { lastInsertRowid: 0 };
  }
}

export function flushAnalytics() {
  // No-op for now; reserved for future batching if needed
}

export function saveFeedback(telegramId: number, eventId: number | null, rating: number, comment?: string) {
  const conn = ensureDb();
  const stmt = conn.prepare(`
    INSERT INTO feedback (telegram_id, event_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(telegramId, eventId, rating, comment || null);
}

export function addAlert(telegramId: number, ticker: string, targetPrice: number, condition: 'above' | 'below') {
  const conn = ensureDb();
  const stmt = conn.prepare(`
    INSERT INTO price_alerts (telegram_id, ticker, target_price, condition)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(telegramId, ticker.toUpperCase(), targetPrice, condition);
}

export function getActiveAlerts() {
  const conn = ensureDb();
  return conn.prepare(`SELECT * FROM price_alerts WHERE is_active = 1`).all() as Array<{
    id: number;
    telegram_id: number;
    ticker: string;
    target_price: number;
    condition: string;
  }>;
}

export function deactivateAlert(alertId: number) {
  const conn = ensureDb();
  conn.prepare(`UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`).run(alertId);
}

export function getUserAlerts(telegramId: number) {
  const conn = ensureDb();
  return conn.prepare(`SELECT * FROM price_alerts WHERE telegram_id = ? ORDER BY created_at DESC`).all(telegramId) as Array<{
    id: number;
    ticker: string;
    target_price: number;
    condition: string;
    is_active: number;
    created_at: string;
  }>;
}

function clampDays(days: number): number {
  const d = Number(days);
  if (!Number.isFinite(d) || d < 1 || d > 365) return 7;
  return Math.floor(d);
}

export function getAnalyticsSummary(days = 7) {
  const conn = ensureDb();
  const safeDays = clampDays(days);
  const totalUsers = conn.prepare(`SELECT COUNT(DISTINCT telegram_id) as count FROM users`).get() as { count: number };
  const totalEvents = conn.prepare(`SELECT COUNT(*) as count FROM analytics_events WHERE created_at >= datetime('now', '-${safeDays} days')`).get() as { count: number };
  const commandStats = conn.prepare(`
    SELECT command, COUNT(*) as count FROM analytics_events
    WHERE created_at >= datetime('now', '-${safeDays} days')
    GROUP BY command ORDER BY count DESC
  `).all() as Array<{ command: string; count: number }>;
  const topTickers = conn.prepare(`
    SELECT ticker, COUNT(*) as count FROM analytics_events
    WHERE ticker IS NOT NULL AND created_at >= datetime('now', '-${safeDays} days')
    GROUP BY ticker ORDER BY count DESC LIMIT 20
  `).all() as Array<{ ticker: string; count: number }>;

  return { totalUsers, totalEvents, commandStats, topTickers };
}

export function exportAnalyticsCsv(days = 30): string {
  const conn = ensureDb();
  const safeDays = clampDays(days);
  const rows = conn.prepare(`
    SELECT ae.*, u.username, u.first_name
    FROM analytics_events ae
    LEFT JOIN users u ON ae.telegram_id = u.telegram_id
    WHERE ae.created_at >= datetime('now', '-${safeDays} days')
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

export function ensureUserWeights(telegramId: number) {
  const conn = ensureDb();
  conn.prepare(`INSERT OR IGNORE INTO user_weights (telegram_id) VALUES (?)`).run(telegramId);
}

export function getUserWeights(telegramId: number) {
  const conn = ensureDb();
  ensureUserWeights(telegramId);
  return conn.prepare(`SELECT * FROM user_weights WHERE telegram_id = ?`).get(telegramId) as {
    telegram_id: number;
    valuation: number;
    profitability: number;
    growth: number;
    financial_health: number;
    momentum: number;
  };
}

export function setUserWeight(telegramId: number, category: string, value: number) {
  const conn = ensureDb();
  const valid = ['valuation', 'profitability', 'growth', 'financial_health', 'momentum'];
  if (!valid.includes(category)) return false;
  const clamped = Math.min(Math.max(Math.round(value), 0), 100);
  conn.prepare(`UPDATE user_weights SET ${category} = ? WHERE telegram_id = ?`).run(clamped, telegramId);
  return true;
}

export function resetUserWeights(telegramId: number) {
  const conn = ensureDb();
  conn.prepare(`
    UPDATE user_weights
    SET valuation = 75, profitability = 85, growth = 70, financial_health = 80, momentum = 50
    WHERE telegram_id = ?
  `).run(telegramId);
}

export function exportWeightsCsv(): string {
  const conn = ensureDb();
  const rows = conn.prepare(`
    SELECT uw.*, u.username, u.first_name
    FROM user_weights uw
    LEFT JOIN users u ON uw.telegram_id = u.telegram_id
    ORDER BY uw.telegram_id
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

/* ─── Natural Language Learning Logs ─── */

export function logChatIntent(log: {
  telegramId: number;
  rawMessage: string;
  detectedIntent?: string;
  extractedTicker?: string;
  executedCommand?: string;
  isFallback?: boolean;
}) {
  const conn = ensureDb();
  const stmt = conn.prepare(`
    INSERT INTO nl_logs (telegram_id, raw_message, detected_intent, extracted_ticker, executed_command, is_fallback)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    log.telegramId,
    log.rawMessage,
    log.detectedIntent || null,
    log.extractedTicker || null,
    log.executedCommand || null,
    log.isFallback ? 1 : 0
  );
}

export function correctChatIntent(logId: number, correctedIntent: string) {
  const conn = ensureDb();
  conn.prepare(`UPDATE nl_logs SET user_corrected_intent = ? WHERE id = ?`).run(correctedIntent, logId);
}

export function saveChatFeedback(logId: number, rating: number) {
  const conn = ensureDb();
  conn.prepare(`UPDATE nl_logs SET user_feedback = ? WHERE id = ?`).run(rating, logId);
}

export function getLearningStats(days = 7) {
  const conn = ensureDb();
  const safeDays = clampDays(days);

  const totalChat = conn.prepare(`
    SELECT COUNT(*) as count FROM nl_logs WHERE created_at >= datetime('now', '-${safeDays} days')
  `).get() as { count: number };

  const fallbackRate = conn.prepare(`
    SELECT COUNT(*) as total, SUM(is_fallback) as fallbacks
    FROM nl_logs WHERE created_at >= datetime('now', '-${safeDays} days')
  `).get() as { total: number; fallbacks: number };

  const intentStats = conn.prepare(`
    SELECT detected_intent, COUNT(*) as count,
      ROUND(AVG(is_fallback) * 100, 1) as fallback_pct
    FROM nl_logs
    WHERE created_at >= datetime('now', '-${safeDays} days')
    GROUP BY detected_intent
    ORDER BY count DESC
  `).all() as Array<{ detected_intent: string; count: number; fallback_pct: number }>;

  const correctionStats = conn.prepare(`
    SELECT user_corrected_intent, COUNT(*) as count
    FROM nl_logs
    WHERE user_corrected_intent IS NOT NULL
      AND created_at >= datetime('now', '-${safeDays} days')
    GROUP BY user_corrected_intent
    ORDER BY count DESC
  `).all() as Array<{ user_corrected_intent: string; count: number }>;

  return { totalChat, fallbackRate, intentStats, correctionStats };
}

export function getMissedIntents(days = 7, limit = 50) {
  const conn = ensureDb();
  const safeDays = clampDays(days);
  return conn.prepare(`
    SELECT id, telegram_id, raw_message, detected_intent, user_corrected_intent, created_at
    FROM nl_logs
    WHERE is_fallback = 1 AND created_at >= datetime('now', '-${safeDays} days')
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    telegram_id: number;
    raw_message: string;
    detected_intent: string | null;
    user_corrected_intent: string | null;
    created_at: string;
  }>;
}

export function exportMissedIntentsCsv(days = 30): string {
  const conn = ensureDb();
  const safeDays = clampDays(days);
  const rows = conn.prepare(`
    SELECT * FROM nl_logs
    WHERE is_fallback = 1 AND created_at >= datetime('now', '-${safeDays} days')
    ORDER BY created_at DESC
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

// Backward-compatible accessor
export function getDb(): DatabaseType {
  return ensureDb();
}

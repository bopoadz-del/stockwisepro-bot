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
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS user_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(telegram_id, ticker)
      );

      CREATE INDEX IF NOT EXISTS idx_user_watchlists_telegram_id ON user_watchlists(telegram_id);

      CREATE TABLE IF NOT EXISTS user_portfolios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        shares REAL NOT NULL DEFAULT 0,
        avg_price REAL NOT NULL DEFAULT 0,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(telegram_id, ticker)
      );

      CREATE INDEX IF NOT EXISTS idx_user_portfolios_telegram_id ON user_portfolios(telegram_id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS web_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_web_users_email ON web_users(email);

      CREATE TABLE IF NOT EXISTS web_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        web_user_id INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(web_user_id, ticker),
        FOREIGN KEY (web_user_id) REFERENCES web_users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_web_watchlists_user ON web_watchlists(web_user_id);

      CREATE TABLE IF NOT EXISTS web_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        web_user_id INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        target_price REAL NOT NULL,
        condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
        is_active INTEGER NOT NULL DEFAULT 1,
        triggered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (web_user_id) REFERENCES web_users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_web_alerts_user ON web_alerts(web_user_id);
      CREATE INDEX IF NOT EXISTS idx_web_alerts_active ON web_alerts(is_active);
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
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

export function getUserLanguage(telegramId: number): 'en' | 'ar' {
  try {
    const conn = ensureDb();
    const row = conn.prepare('SELECT language FROM users WHERE telegram_id = ?').get(telegramId) as { language?: string } | undefined;
    return row?.language === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function setUserLanguage(telegramId: number, language: 'en' | 'ar') {
  const conn = ensureDb();
  const lang = language === 'ar' ? 'ar' : 'en';
  // Ensure a row exists, then set the language.
  conn.prepare('INSERT OR IGNORE INTO users (telegram_id) VALUES (?)').run(telegramId);
  conn.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(lang, telegramId);
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

const VALID_WEIGHT_COLUMNS: Record<string, string> = {
  valuation: 'valuation',
  profitability: 'profitability',
  growth: 'growth',
  financial_health: 'financial_health',
  momentum: 'momentum',
};

export function setUserWeight(telegramId: number, category: string, value: number) {
  const conn = ensureDb();
  const col = VALID_WEIGHT_COLUMNS[category];
  if (!col) return false;
  const clamped = Math.min(Math.max(Math.round(value), 0), 100);
  conn.prepare(`UPDATE user_weights SET ${col} = ? WHERE telegram_id = ?`).run(clamped, telegramId);
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
    SELECT COUNT(*) as total, COALESCE(SUM(is_fallback), 0) as fallbacks
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

/* ─── Local Watchlist / Portfolio Fallbacks ─── */

export function getLocalWatchlist(telegramId: number) {
  const conn = ensureDb();
  return conn.prepare(`SELECT ticker, added_at FROM user_watchlists WHERE telegram_id = ? ORDER BY added_at DESC`).all(telegramId) as Array<{
    ticker: string;
    added_at: string;
  }>;
}

export function addLocalWatchlistItem(telegramId: number, ticker: string) {
  const conn = ensureDb();
  try {
    conn.prepare(`INSERT INTO user_watchlists (telegram_id, ticker) VALUES (?, ?)`).run(telegramId, ticker.toUpperCase());
    return true;
  } catch {
    return false; // duplicate
  }
}

export function removeLocalWatchlistItem(telegramId: number, ticker: string) {
  const conn = ensureDb();
  conn.prepare(`DELETE FROM user_watchlists WHERE telegram_id = ? AND ticker = ?`).run(telegramId, ticker.toUpperCase());
  return true;
}

export function getLocalPortfolio(telegramId: number) {
  const conn = ensureDb();
  return conn.prepare(`SELECT ticker, shares, avg_price FROM user_portfolios WHERE telegram_id = ? ORDER BY added_at DESC`).all(telegramId) as Array<{
    ticker: string;
    shares: number;
    avg_price: number;
  }>;
}

export function setLocalPortfolioItem(telegramId: number, ticker: string, shares: number, avgPrice: number) {
  const conn = ensureDb();
  conn.prepare(`
    INSERT INTO user_portfolios (telegram_id, ticker, shares, avg_price)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id, ticker) DO UPDATE SET
      shares = excluded.shares,
      avg_price = excluded.avg_price
  `).run(telegramId, ticker.toUpperCase(), shares, avgPrice);
}

export function removeLocalPortfolioItem(telegramId: number, ticker: string) {
  const conn = ensureDb();
  conn.prepare(`DELETE FROM user_portfolios WHERE telegram_id = ? AND ticker = ?`).run(telegramId, ticker.toUpperCase());
}

/* ─── Web User Management ─── */

export function createWebUser(email: string, passwordHash: string, name?: string) {
  const conn = ensureDb();
  try {
    const result = conn.prepare(
      'INSERT INTO web_users (email, password_hash, name) VALUES (?, ?, ?)'
    ).run(email.toLowerCase(), passwordHash, name || null);
    return { id: Number(result.lastInsertRowid), email: email.toLowerCase(), name: name || null };
  } catch (err) {
    return null; // likely duplicate email
  }
}

export function findWebUserByEmail(email: string) {
  const conn = ensureDb();
  return conn.prepare('SELECT * FROM web_users WHERE email = ?').get(email.toLowerCase()) as {
    id: number;
    email: string;
    password_hash: string;
    name: string | null;
    created_at: string;
  } | undefined;
}

export function findWebUserById(id: number) {
  const conn = ensureDb();
  return conn.prepare('SELECT * FROM web_users WHERE id = ?').get(id) as {
    id: number;
    email: string;
    password_hash: string;
    name: string | null;
    created_at: string;
  } | undefined;
}

export function getWebWatchlist(webUserId: number) {
  const conn = ensureDb();
  return conn.prepare('SELECT ticker, added_at FROM web_watchlists WHERE web_user_id = ? ORDER BY added_at DESC').all(webUserId) as Array<{
    ticker: string;
    added_at: string;
  }>;
}

export function addWebWatchlistItem(webUserId: number, ticker: string) {
  const conn = ensureDb();
  try {
    conn.prepare('INSERT INTO web_watchlists (web_user_id, ticker) VALUES (?, ?)').run(webUserId, ticker.toUpperCase());
    return true;
  } catch {
    return false;
  }
}

export function removeWebWatchlistItem(webUserId: number, ticker: string) {
  const conn = ensureDb();
  conn.prepare('DELETE FROM web_watchlists WHERE web_user_id = ? AND ticker = ?').run(webUserId, ticker.toUpperCase());
  return true;
}

export function getWebAlerts(webUserId: number) {
  const conn = ensureDb();
  return conn.prepare('SELECT * FROM web_alerts WHERE web_user_id = ? ORDER BY created_at DESC').all(webUserId) as Array<{
    id: number;
    ticker: string;
    target_price: number;
    condition: string;
    is_active: number;
    created_at: string;
  }>;
}

export function addWebAlert(webUserId: number, ticker: string, targetPrice: number, condition: 'above' | 'below') {
  const conn = ensureDb();
  return conn.prepare('INSERT INTO web_alerts (web_user_id, ticker, target_price, condition) VALUES (?, ?, ?, ?)').run(
    webUserId, ticker.toUpperCase(), targetPrice, condition
  );
}

export function removeWebAlert(webUserId: number, alertId: number) {
  const conn = ensureDb();
  conn.prepare('DELETE FROM web_alerts WHERE id = ? AND web_user_id = ?').run(alertId, webUserId);
  return true;
}

// Backward-compatible accessor — always returns initialized db
export function getDb(): DatabaseType {
  return ensureDb();
}

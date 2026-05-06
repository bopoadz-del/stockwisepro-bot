import { Context } from 'telegraf';
import { logEvent, ensureUser, getDb } from '../db';
import { logger } from '../utils/logger';

export function analyticsMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const from = ctx.from;
    if (from) {
      ensureUser(from.id, from.username, from.first_name, from.last_name);
    }

    const start = Date.now();
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const command = text.split(' ')[0] || 'unknown';
    const rawInput = text;
    const telegramId = ctx.from?.id || 0;

    const eventResult = logEvent({
      telegramId,
      command,
      rawInput,
      success: true,
    });
    const eventId = eventResult.lastInsertRowid as number;
    ctx.state.eventId = eventId;

    try {
      await next();
      const state = ctx.state || {};
      getDb().prepare(`
        UPDATE analytics_events
        SET ticker = ?, api_response_time_ms = ?, success = ?, error_message = ?
        WHERE id = ?
      `).run(
        state.ticker || null,
        state.apiDuration || (Date.now() - start),
        state.success !== false ? 1 : 0,
        state.errorMessage || null,
        eventId
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Command failed', { command, telegramId, error: errorMessage });
      getDb().prepare(`UPDATE analytics_events SET success = 0, error_message = ? WHERE id = ?`)
        .run(errorMessage, eventId);
      throw err;
    }
  };
}

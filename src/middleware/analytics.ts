import { Context } from 'telegraf';
import { logEvent } from '../db';
import { logger } from '../utils/logger';

export function analyticsMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const start = Date.now();
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const command = text.split(' ')[0] || 'unknown';
    const rawInput = text;
    const telegramId = ctx.from?.id || 0;

    try {
      await next();
      logEvent({
        telegramId,
        command,
        rawInput,
        apiResponseTimeMs: Date.now() - start,
        success: true,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Command failed', { command, telegramId, error: errorMessage });
      logEvent({
        telegramId,
        command,
        rawInput,
        apiResponseTimeMs: Date.now() - start,
        success: false,
        errorMessage,
      });
      throw err;
    }
  };
}

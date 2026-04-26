import { Context } from 'telegraf';
import { logger } from '../utils/logger';

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const buckets = new Map<number, { count: number; resetAt: number }>();

// Cleanup old entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) buckets.delete(id);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

export async function rateLimitMiddleware(ctx: Context, next: () => Promise<void>) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await next();
    return;
  }

  const now = Date.now();
  const bucket = buckets.get(telegramId);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(telegramId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    await next();
    return;
  }

  if (bucket.count >= MAX_REQUESTS) {
    logger.warn('Rate limit hit', { telegramId, count: bucket.count });
    await ctx.reply('⏳ Too many requests. Please slow down.');
    return;
  }

  bucket.count++;
  await next();
}

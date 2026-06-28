import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { getUserLanguage } from '../db';
import { Lang } from '../i18n';

/**
 * Loads the user's preferred language into ctx.state.lang on every update so
 * commands can render localized text without re-querying the DB.
 */
export function i18nMiddleware(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const uid = ctx.from?.id;
    if (uid) {
      try {
        ctx.state.lang = getUserLanguage(uid);
      } catch {
        ctx.state.lang = 'en';
      }
    } else {
      ctx.state.lang = 'en';
    }
    return next();
  };
}

/** Resolve the active language for a context, defaulting to English. */
export function langOf(ctx: BotContext): Lang {
  return ctx.state.lang === 'ar' ? 'ar' : 'en';
}

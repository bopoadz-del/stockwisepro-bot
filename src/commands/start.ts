import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser } from '../db';
import { t, LANG_NAMES } from '../i18n';
import { langOf } from '../middleware/i18n';

export async function startCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const lang = langOf(ctx);
  const welcome = t(lang, 'start.welcome');

  // Offer a language choice bubble inline with the welcome message.
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(`🇬🇧 ${LANG_NAMES.en}`, 'setlang:en'),
      Markup.button.callback(`🇸🇦 ${LANG_NAMES.ar}`, 'setlang:ar'),
    ],
  ]);

  await ctx.replyWithMarkdown(welcome, keyboard);
}

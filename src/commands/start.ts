import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser } from '../db';
import { t, LANG_NAMES } from '../i18n';
import { langOf } from '../middleware/i18n';
import { config } from '../config';

export async function startCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const lang = langOf(ctx);
  const welcome = t(lang, 'start.welcome');

  // Welcome bubbles: a website link (when configured) plus a language choice.
  const rows = [];
  if (config.websiteUrl) {
    rows.push([Markup.button.url(t(lang, 'start.website'), config.websiteUrl)]);
  }
  rows.push([
    Markup.button.callback(`🇬🇧 ${LANG_NAMES.en}`, 'setlang:en'),
    Markup.button.callback(`🇸🇦 ${LANG_NAMES.ar}`, 'setlang:ar'),
  ]);

  await ctx.replyWithMarkdown(welcome, Markup.inlineKeyboard(rows));
}

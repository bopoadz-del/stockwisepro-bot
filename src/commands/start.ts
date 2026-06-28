import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser, getUserProfile, upsertWebUserByTelegram } from '../db';
import { t, LANG_NAMES } from '../i18n';
import { langOf } from '../middleware/i18n';
import { config } from '../config';
import { signTelegramLinkToken } from '../web/auth';

export async function startCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const lang = langOf(ctx);
  const welcome = t(lang, 'start.welcome');

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;

  // Auto-create a profile the moment someone starts the bot, so the website
  // link signs them straight into the same profile.
  const profile = getUserProfile(from.id);
  upsertWebUserByTelegram(from.id, profile?.email ?? null, displayName);

  // Welcome bubbles: a website link (when configured) plus a language choice.
  const rows = [];
  if (config.websiteUrl) {
    const token = signTelegramLinkToken({ tid: from.id, email: profile?.email ?? null, name: displayName });
    const sep = config.websiteUrl.includes('?') ? '&' : '?';
    const url = `${config.websiteUrl}${sep}tg=${token}`;
    rows.push([Markup.button.url(t(lang, 'start.website'), url)]);
  }
  rows.push([
    Markup.button.callback(`🇬🇧 ${LANG_NAMES.en}`, 'setlang:en'),
    Markup.button.callback(`🇸🇦 ${LANG_NAMES.ar}`, 'setlang:ar'),
  ]);

  await ctx.replyWithMarkdown(welcome, Markup.inlineKeyboard(rows));
}

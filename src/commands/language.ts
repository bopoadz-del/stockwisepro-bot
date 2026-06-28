import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser, setUserLanguage } from '../db';
import { t, LANG_NAMES, normalizeLang } from '../i18n';
import { langOf } from '../middleware/i18n';

/** /language — show a language picker. */
export async function languageCommand(ctx: BotContext) {
  const lang = langOf(ctx);
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(`🇬🇧 ${LANG_NAMES.en}`, 'setlang:en'),
      Markup.button.callback(`🇸🇦 ${LANG_NAMES.ar}`, 'setlang:ar'),
    ],
  ]);
  await ctx.replyWithMarkdown(t(lang, 'language.prompt'), keyboard);
}

/** Callback handler for setlang:<en|ar>. */
export async function handleSetLanguageCallback(ctx: BotContext) {
  if (!('match' in ctx) || !ctx.match) return;
  const match = ctx.match as RegExpExecArray;
  const chosen = normalizeLang(match[1]);
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);
  setUserLanguage(from.id, chosen);
  ctx.state.lang = chosen;

  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(t(chosen, 'language.changed'), { parse_mode: 'Markdown' });
  } catch {
    await ctx.replyWithMarkdown(t(chosen, 'language.changed'));
  }
}

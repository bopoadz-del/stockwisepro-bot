import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser } from '../db';
import { t } from '../i18n';
import { langOf } from '../middleware/i18n';

export async function startCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const welcome = t(langOf(ctx), 'start.welcome');

  await ctx.replyWithMarkdown(welcome, Markup.removeKeyboard());
}

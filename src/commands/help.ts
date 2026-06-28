import { BotContext } from '../types';
import { HELP_LINES } from '../i18n';
import { langOf } from '../middleware/i18n';

export async function helpCommand(ctx: BotContext) {
  await ctx.replyWithMarkdown(HELP_LINES[langOf(ctx)]);
}

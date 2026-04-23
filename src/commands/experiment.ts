import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';

export async function experimentCommand(ctx: Context) {
  await ctx.reply(
    `🧪 *Experiment Workspace*\n\nSend me a formula and I'll backtest it.\n\n*Example:*\n\`score = pe_ratio < 20 and debt_to_equity < 0.5\`\n\nReply with your formula, or type /cancel to abort.`,
    { parse_mode: 'Markdown' }
  );
  // Scene transition is handled in main index via hears or scene middleware
}

export async function runExperimentFromText(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.runExperiment(text, undefined, telegramId);
  (ctx as BotContext).state = { apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  const result = data?.result || data?.backtest || JSON.stringify(data, null, 2);
  await ctx.reply(`🧪 *Result:*\n\n\`\`\`\n${result}\n\`\`\``, { parse_mode: 'Markdown' });
}

import { Context } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';

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

  const { data, duration, error } = await stockwise.runExperiment(text);
  logEvent({ telegramId, command: '/experiment', rawInput: text.substring(0, 500), apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Experiment error: ${JSON.stringify(error)}`);
    return;
  }

  const result = data?.result || data?.backtest || JSON.stringify(data, null, 2);
  await ctx.reply(`🧪 *Result:*\n\n\`\`\`\n${result}\n\`\`\``, { parse_mode: 'Markdown' });
}

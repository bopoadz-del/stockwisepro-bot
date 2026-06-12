import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { runBacktest } from '../services/backtest';
import { userSafeError } from '../utils/logger';

// Tracks users currently awaiting experiment formula input (telegramId → true)
export const pendingExperiment = new Set<number>();

export async function experimentCommand(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (telegramId) pendingExperiment.add(telegramId);

  await ctx.reply(
    `🧪 *Experiment Workspace*\n\nSend me a formula and I'll backtest it.\n\n*Example:*\n\`pe_ratio < 20 and debt_to_equity < 0.5\`\n\nJust type your formula now, or /cancel to abort.`,
    { parse_mode: 'Markdown' }
  );
}

function formatResultObject(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !['id', 'createdAt', 'updatedAt', 'telegramId'].includes(k))
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const formatted = typeof v === 'number'
        ? (Number.isInteger(v) ? v : (v as number).toFixed(4))
        : v;
      return `${label}: ${formatted}`;
    });
  return entries.length > 0 ? entries.join('\n') : 'No result data returned.';
}

export async function runExperimentFromText(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.runExperiment(text, undefined, telegramId);
  Object.assign(ctx.state, { apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  // Local 6M forward-return backtest
  const backtest = await runBacktest(text);

  let resultText: string;
  if (typeof data?.result === 'string') {
    resultText = data.result;
  } else if (typeof data?.backtest === 'string') {
    resultText = data.backtest;
  } else if (data?.result !== undefined) {
    resultText = formatResultObject(data.result);
  } else if (data?.backtest !== undefined) {
    resultText = formatResultObject(data.backtest);
  } else if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
      .filter(([k]) => !['id', 'createdAt', 'updatedAt', 'telegramId'].includes(k))
      .map(([k, v]) => {
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${label}: ${typeof v === 'number' ? (Number.isInteger(v) ? v : (v as number).toFixed(4)) : v}`;
      });
    resultText = entries.length > 0 ? entries.join('\n') : 'No result data returned.';
  } else {
    resultText = String(data ?? 'No result returned.');
  }
  const backtestLines = [
    `📊 *6M Forward Return Backtest*`,
    `Tested: ${backtest.totalTested} stocks | Selected: ${backtest.selectedCount}`,
    backtest.selectedReturn !== null
      ? `Selected avg return: ${(backtest.selectedReturn * 100).toFixed(2)}%`
      : 'Selected avg return: n/a',
    backtest.marketReturn !== null
      ? `SPY (6M) return: ${(backtest.marketReturn * 100).toFixed(2)}%`
      : 'SPY return: n/a',
    `Winners: ${backtest.winners} | Losers: ${backtest.losers}`,
  ];

  await ctx.reply(
    `🧪 *Experiment Result:*\n\n\`\`\`\n${resultText}\n\`\`\`\n\n${backtestLines.join('\n')}`,
    { parse_mode: 'Markdown' }
  );
}

import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';

const INVESTORS = [
  { id: 'buffett', name: 'Warren Buffett', style: 'Value' },
  { id: 'dalio', name: 'Ray Dalio', style: 'All Weather' },
  { id: 'wood', name: 'Cathie Wood', style: 'Growth/ Innovation' },
  { id: 'lynch', name: 'Peter Lynch', style: 'Growth at Reasonable Price' },
  { id: 'graham', name: 'Benjamin Graham', style: 'Deep Value' },
  { id: 'templeton', name: 'John Templeton', style: 'Contrarian' },
];

// Tracks users awaiting investment amount after selecting an investor
export const pendingMimic = new Map<number, { investorId: string }>();

export async function mimicCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  pendingMimic.delete(telegramId);

  const keyboard = INVESTORS.map(inv => [
    Markup.button.callback(`${inv.name} (${inv.style})`, `mimic_select:${inv.id}`)
  ]);

  await ctx.replyWithMarkdown(
    '🧠 *Mimic an Investor*\n\nChoose a legend to copy their strategy:',
    Markup.inlineKeyboard(keyboard)
  );

  Object.assign(ctx.state, { success: true });
}

export async function handleMimicCallback(ctx: Context) {
  if (!('match' in ctx) || !ctx.match) return;
  const investorId = (ctx.match as RegExpExecArray)[1];
  const telegramId = ctx.from?.id || 0;
  const investor = INVESTORS.find(i => i.id === investorId);

  if (!investor) {
    await ctx.answerCbQuery('Investor not found');
    return;
  }

  await ctx.answerCbQuery(`Selected ${investor.name}`);
  pendingMimic.set(telegramId, { investorId });

  await ctx.replyWithMarkdown(
    `✅ *${investor.name}* selected.\n\n` +
    `How much do you want to invest?\n\n` +
    `Reply with an amount (e.g. \`10000\` or \`5000.50\`). Use /cancel to abort.`
  );
}

export async function runMimicFromAmount(ctx: Context, amountText: string) {
  const telegramId = ctx.from?.id || 0;
  const pending = pendingMimic.get(telegramId);
  if (!pending) return;

  const amount = parseFloat(amountText.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply('❌ Please enter a valid positive number. Try again or /cancel to abort.');
    return;
  }

  pendingMimic.delete(telegramId);
  const investor = INVESTORS.find(i => i.id === pending.investorId);
  if (!investor) {
    await ctx.reply(userSafeError());
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.mimicInvestor(pending.investorId, amount, telegramId);
  Object.assign(ctx.state, { ticker: pending.investorId, apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error || !data) {
    await ctx.reply(userSafeError());
    return;
  }

  const holdings = data?.holdings?.map((h: any) => {
    const ticker = h.ticker || h.symbol || '?';
    const pct = h.percentage ?? h.weight ?? h.allocation ?? '?';
    const dollar = h.dollarAmount ?? h.amount ?? (typeof pct === 'number' && typeof amount === 'number' ? (pct / 100) * amount : undefined);
    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    const dollarStr = typeof dollar === 'number' ? ` ($${dollar.toLocaleString(undefined, { maximumFractionDigits: 2 })})` : '';
    return `• *${ticker}* — ${pctStr}${dollarStr}`;
  }).join('\n') || 'See portfolio for details.';

  await ctx.replyWithMarkdown(
    `✅ *Mimicking ${investor.name}*\n\n` +
    `💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Suggested allocation:*\n${holdings}\n\n` +
    `_Use /portfolio to view full details._`
  );
}

import { Context, Markup } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';

const INVESTORS = [
  { id: 'buffett', name: 'Warren Buffett', style: 'Value' },
  { id: 'dalio', name: 'Ray Dalio', style: 'All Weather' },
  { id: 'wood', name: 'Cathie Wood', style: 'Growth/ Innovation' },
  { id: 'lynch', name: 'Peter Lynch', style: 'Growth at Reasonable Price' },
  { id: 'graham', name: 'Benjamin Graham', style: 'Deep Value' },
  { id: 'templeton', name: 'John Templeton', style: 'Contrarian' },
];

export async function mimicCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;

  const keyboard = INVESTORS.map(inv => [
    Markup.button.callback(`${inv.name} (${inv.style})`, `mimic_select:${inv.id}`)
  ]);

  await ctx.replyWithMarkdown(
    '🧠 *Mimic an Investor*\n\nChoose a legend to copy their strategy:',
    Markup.inlineKeyboard(keyboard)
  );

  logEvent({ telegramId, command: '/mimic', success: true });
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
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.mimicInvestor(investorId);
  logEvent({ telegramId, command: '/mimic_exec', ticker: investorId, apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Mimic failed: ${JSON.stringify(error)}`);
    return;
  }

  const holdings = data?.holdings?.map((h: any) => `• *${h.ticker}* — ${h.percentage || h.weight || '?'}%`).join('\n') || 'See portfolio for details.';

  await ctx.replyWithMarkdown(
    `✅ *Now mimicking ${investor.name}*\n\n*Suggested allocation:*\n${holdings}\n\n_Use /portfolio to view full details._`
  );
}

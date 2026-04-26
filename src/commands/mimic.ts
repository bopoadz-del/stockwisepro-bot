import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { logger } from '../utils/logger';

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

export async function handleMimicCallback(ctx: BotContext) {
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

  const holdings = data?.holdings || [];
  if (holdings.length === 0) {
    await ctx.replyWithMarkdown(
      `✅ *Mimicking ${investor.name}*\n\n` +
      `💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
      `No specific holdings returned. Use /portfolio to view details.`
    );
    return;
  }

  // Fetch prices for all holdings in parallel to calculate share counts
  const pricePromises = holdings.map(async (h: any) => {
    const ticker = h.ticker || h.symbol;
    if (!ticker) return { ticker, price: null };
    try {
      const res = await stockwise.getStock(ticker, telegramId);
      const price = res.data?.price ?? res.data?.currentPrice ?? res.data?.regularMarketPrice ?? null;
      return { ticker, price: price ? parseFloat(price) : null };
    } catch (e) {
      logger.warn(`Price fetch failed for ${ticker}`, { error: (e as Error).message });
      return { ticker, price: null };
    }
  });

  const prices = await Promise.all(pricePromises);
  const priceMap = new Map(prices.map(p => [p.ticker, p.price]));

  let totalAllocated = 0;
  const lines = holdings.map((h: any) => {
    const ticker = h.ticker || h.symbol || '?';
    const pct = parseFloat(h.percentage ?? h.weight ?? 0);
    const dollarAmount = amount * (pct / 100);
    totalAllocated += dollarAmount;

    const price = priceMap.get(ticker);
    let detail = '';
    if (price && price > 0) {
      const shares = dollarAmount / price;
      const sharesStr = shares >= 1 ? shares.toFixed(2) : shares.toFixed(4);
      detail = `${sharesStr} shares @ $${price.toFixed(2)}`;
    } else {
      detail = `$${dollarAmount.toFixed(2)}`;
    }

    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    return `• *${ticker}* — ${pctStr} → ${detail}`;
  });

  const msg =
    `✅ *Mimicking ${investor.name}*\n\n` +
    `💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Suggested allocation:*\n${lines.join('\n')}\n\n` +
    `*Total Allocated:* ~$${totalAllocated.toFixed(2)}\n\n` +
    `_Use /portfolio to view full details._`;

  await ctx.replyWithMarkdown(msg);
}

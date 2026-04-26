import { Context, Markup } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';
import { logger } from '../utils/logger';
import { BotContext } from '../types';

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

  // Store in session
  if (!ctx.session) ctx.session = {};
  ctx.session.awaitingMimicAmount = investorId;

  await ctx.replyWithMarkdown(
    `✅ *${investor.name}* selected.\n\nHow much do you want to invest?\n\nReply with an amount (e.g. 10000 or 5000.50). Use /cancel to abort.`
  );

  logEvent({ telegramId, command: '/mimic_select', ticker: investorId, success: true });
}

export async function handleMimicAmount(ctx: BotContext, text: string) {
  const investorId = ctx.session?.awaitingMimicAmount;
  const telegramId = ctx.from?.id || 0;

  if (!investorId) return;

  // Clear session immediately to prevent double-processing
  delete ctx.session?.awaitingMimicAmount;

  const investor = INVESTORS.find(i => i.id === investorId);
  if (!investor) {
    await ctx.reply('❌ Investor session expired. Please start over with /mimic');
    return;
  }

  if (text.toLowerCase() === '/cancel') {
    await ctx.reply('❌ Mimic cancelled.');
    return;
  }

  // Parse amount: remove commas, spaces, $ signs
  const cleanText = text.replace(/[$,\s]/g, '');
  const amount = parseFloat(cleanText);

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a valid number like 10000 or 5000.50. Use /mimic to try again.');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.mimicInvestor(investorId, amount);
  logEvent({ telegramId, command: '/mimic_exec', ticker: investorId, apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Mimic failed: ${JSON.stringify(error)}`);
    return;
  }

  const holdings = data?.holdings || [];
  if (holdings.length === 0) {
    await ctx.replyWithMarkdown(
      `✅ *Now mimicking ${investor.name}*\n\nNo specific holdings returned. Use /portfolio to view details.`
    );
    return;
  }

  // Fetch prices for all holdings in parallel
  const pricePromises = holdings.map(async (h: any) => {
    const ticker = h.ticker || h.symbol;
    try {
      const res = await stockwise.getStock(ticker);
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
    const percentage = parseFloat(h.percentage ?? h.weight ?? 0);
    const dollarAmount = amount * (percentage / 100);
    totalAllocated += dollarAmount;

    const price = priceMap.get(ticker);
    let detail = '';
    if (price && price > 0) {
      const shares = dollarAmount / price;
      const sharesStr = shares >= 1 ? shares.toFixed(2) : shares.toFixed(4);
      detail = `${sharesStr} shares @ $${price.toFixed(2)}`;
    } else {
      detail = `$${dollarAmount.toFixed(2)} allocation`;
    }

    return `• *${ticker}* — ${percentage}% → ${detail}`;
  });

  const msg = `✅ *${investor.name}* Portfolio ($${amount.toLocaleString()})\n\n${lines.join('\n')}\n\n*Total Allocated:* ~$${totalAllocated.toFixed(2)}`;

  await ctx.replyWithMarkdown(msg);
}

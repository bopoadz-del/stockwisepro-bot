import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { logger } from '../utils/logger';
import { getLocalMimicAllocation, findReplacement } from '../services/mimic';
import { loadCongressTraders } from '../services/universe';

const INVESTORS = [
  { id: 'buffett', name: 'Warren Buffett', style: 'Value' },
  { id: 'dalio', name: 'Ray Dalio', style: 'All Weather' },
  { id: 'wood', name: 'Cathie Wood', style: 'Growth/ Innovation' },
  { id: 'lynch', name: 'Peter Lynch', style: 'Growth at Reasonable Price' },
  { id: 'graham', name: 'Benjamin Graham', style: 'Deep Value' },
  { id: 'templeton', name: 'John Templeton', style: 'Contrarian' },
];

const CONGRESS_TRADERS = Object.entries(loadCongressTraders()).map(([id, t]) => ({
  id: `congress:${id}`,
  name: t.name,
  style: `Congress (${t.party})`,
}));

// Tracks users through the mimic flow
export interface MimicState {
  investorId: string;
  ethicsEnabled?: boolean;
  stage: 'select' | 'ethics' | 'amount' | 'done';
}
export const pendingMimic = new Map<number, MimicState>();

// Remember last mimic settings for replacement commands
export const lastMimic = new Map<number, { investorId: string; ethicsEnabled: boolean }>();

export async function mimicCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  pendingMimic.delete(telegramId);

  const investorButtons = INVESTORS.map(inv => [
    Markup.button.callback(`${inv.name} (${inv.style})`, `mimic_select:${inv.id}`)
  ]);

  const congressButtons = CONGRESS_TRADERS.slice(0, 4).map(t => [
    Markup.button.callback(`🏛️ ${t.name} (${t.style})`, `mimic_select:${t.id}`)
  ]);

  await ctx.replyWithMarkdown(
    '🧠 *Mimic an Investor or Congress Trader*\n\nChoose a legend to copy their strategy:',
    Markup.inlineKeyboard([...investorButtons, ...congressButtons])
  );

  Object.assign(ctx.state, { success: true });
}

export async function handleMimicCallback(ctx: BotContext) {
  if (!('match' in ctx) || !ctx.match) return;
  const investorId = (ctx.match as RegExpExecArray)[1];
  const telegramId = ctx.from?.id || 0;

  const isCongress = investorId.startsWith('congress:');
  const cleanId = isCongress ? investorId.replace('congress:', '') : investorId;

  const name = INVESTORS.find(i => i.id === cleanId)?.name
    || loadCongressTraders()[cleanId]?.name
    || 'Unknown';

  await ctx.answerCbQuery(`Selected ${name}`);

  // Ask ethics question
  pendingMimic.set(telegramId, { investorId, stage: 'ethics' });

  await ctx.replyWithMarkdown(
    `✅ *${name}* selected.\n\n` +
    `Apply ethical filter?\n\n` +
    `✅ *Yes* — exclude weapons, adult entertainment, blacklisted sectors\n` +
    `❌ *No* — include all stocks`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Yes, ethical', `mimic_ethics:yes`), Markup.button.callback('❌ No, all stocks', `mimic_ethics:no`)],
    ])
  );
}

export async function handleMimicEthicsCallback(ctx: BotContext) {
  if (!('match' in ctx) || !ctx.match) return;
  const choice = (ctx.match as RegExpExecArray)[1];
  const telegramId = ctx.from?.id || 0;
  const pending = pendingMimic.get(telegramId);

  if (!pending || pending.stage !== 'ethics') {
    await ctx.answerCbQuery('Session expired');
    return;
  }

  const ethicsEnabled = choice === 'yes';
  pending.ethicsEnabled = ethicsEnabled;
  pending.stage = 'amount';
  pendingMimic.set(telegramId, pending);

  await ctx.answerCbQuery(ethicsEnabled ? 'Ethical filter ON' : 'Ethical filter OFF');

  const investorName = getInvestorName(pending.investorId);
  await ctx.replyWithMarkdown(
    `${ethicsEnabled ? '✅' : '❌'} Ethical filter: *${ethicsEnabled ? 'ON' : 'OFF'}*\n\n` +
    `How much do you want to invest in *${investorName}*?\n\n` +
    `Reply with an amount (e.g. \`10000\` or \`5000.50\`). Use /cancel to abort.`
  );
}

export async function runMimicFromAmount(ctx: Context, amountText: string) {
  const telegramId = ctx.from?.id || 0;
  const pending = pendingMimic.get(telegramId);
  if (!pending || pending.stage !== 'amount') return;

  const amount = parseFloat(amountText.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply('❌ Please enter a valid positive number. Try again or /cancel to abort.');
    return;
  }

  pendingMimic.delete(telegramId);
  lastMimic.set(telegramId, { investorId: pending.investorId, ethicsEnabled: pending.ethicsEnabled || false });
  const investorName = getInvestorName(pending.investorId);

  await ctx.replyWithChatAction('typing');

  // Build portfolio using local screener
  const mimicResult = getLocalMimicAllocation(pending.investorId, pending.ethicsEnabled);
  if (!mimicResult) {
    await ctx.reply(userSafeError());
    return;
  }

  const data = { holdings: mimicResult.holdings };
  Object.assign(ctx.state, { ticker: pending.investorId, apiDuration: 0, success: true });

  const holdings = data.holdings;
  if (holdings.length === 0) {
    await ctx.replyWithMarkdown(
      `⚠️ *Mimic returned empty portfolio*\n\n` +
      `*Investor:* ${investorName}\n` +
      `*Amount:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
      `No holdings matched the criteria.`
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

  let msg =
    `✅ *Mimicking ${investorName}*\n`;
  if (mimicResult.ethicsApplied) {
    msg += `🛡️ *Ethics filter: ON*\n`;
  }
  if (mimicResult.replacedTickers && mimicResult.replacedTickers.length > 0) {
    msg += `🔄 *Replacements:* ${mimicResult.replacedTickers.map(r => `${r.old}→${r.new}`).join(', ')}\n`;
  }
  msg += `\n💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Suggested allocation:*\n${lines.join('\n')}\n\n` +
    `*Total Allocated:* ~$${totalAllocated.toFixed(2)}\n\n` +
    `_Reply with \`replace AAPL with MSFT\` to swap tickers._`;

  await ctx.replyWithMarkdown(msg);
}

export async function handleMimicReplacement(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;

  // Parse "replace AAPL with MSFT" or "replace AAPL"
  const match = text.match(/^replace\s+(\w+)(?:\s+with\s+(\w+))?$/i);
  if (!match) return false;

  const oldTicker = match[1].toUpperCase();
  const newTicker = match[2]?.toUpperCase();

  const last = lastMimic.get(telegramId);
  if (!last) {
    await ctx.reply(
      `🔄 Run /mimic first to select an investor, then type \`replace ${oldTicker}${newTicker ? ` with ${newTicker}` : ''}\`.`
    );
    return true;
  }

  await ctx.replyWithChatAction('typing');

  const mimicResult = getLocalMimicAllocation(last.investorId, last.ethicsEnabled, [
    { oldTicker, newTicker },
  ]);

  if (!mimicResult) {
    await ctx.reply('❌ Could not build replacement portfolio.');
    return true;
  }

  const investorName = getInvestorName(last.investorId);
  const holdings = mimicResult.holdings;

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

  const lines = holdings.map((h: any) => {
    const ticker = h.ticker || h.symbol || '?';
    const pct = parseFloat(h.percentage ?? h.weight ?? 0);
    const price = priceMap.get(ticker);
    let detail = '';
    if (price && price > 0) {
      detail = `@ $${price.toFixed(2)}`;
    }
    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    return `• *${ticker}* — ${pctStr} ${detail}`;
  });

  let msg = `🔄 *Updated ${investorName} Portfolio*\n`;
  if (mimicResult.ethicsApplied) msg += `🛡️ Ethics filter: ON\n`;
  msg += `\n*Holdings:*\n${lines.join('\n')}`;

  if (mimicResult.replacedTickers && mimicResult.replacedTickers.length > 0) {
    msg += `\n\n*Swapped:* ${mimicResult.replacedTickers.map(r => `${r.old} → ${r.new}`).join(', ')}`;
  }

  await ctx.replyWithMarkdown(msg);
  return true;
}

function getInvestorName(investorId: string): string {
  if (investorId.startsWith('congress:')) {
    const id = investorId.replace('congress:', '');
    return loadCongressTraders()[id]?.name || 'Unknown Trader';
  }
  return INVESTORS.find(i => i.id === investorId)?.name || 'Unknown Investor';
}

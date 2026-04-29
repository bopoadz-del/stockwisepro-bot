import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { logger } from '../utils/logger';
import { getLocalMimicAllocation, findReplacement, fetchMimicPrices, MimicHolding } from '../services/mimic';
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

// ─── Mimic State Machine ───────────────────────────────────────────────────

export interface MimicState {
  investorId: string;
  ethicsEnabled: boolean;
  stage: 'select' | 'ethics' | 'amount' | 'review' | 'done';
  amount?: number;
  holdings?: MimicHolding[];
  priceMap?: Map<string, number | null>;
  pricePromise?: Promise<Map<string, number | null>>;
  replacedTickers?: Array<{ old: string; new: string; reason: string }>;
}

export const pendingMimic = new Map<number, MimicState>();

// Remember last mimic for replacement commands outside the flow
export const lastMimic = new Map<number, { investorId: string; ethicsEnabled: boolean }>();

// ─── Commands ──────────────────────────────────────────────────────────────

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
  pendingMimic.set(telegramId, { investorId, ethicsEnabled: false, stage: 'ethics' });

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

// ─── Step 3: User typed an amount → build portfolio, show it, start price fetch ──

export async function runMimicFromAmount(ctx: Context, amountText: string) {
  const telegramId = ctx.from?.id || 0;
  const pending = pendingMimic.get(telegramId);
  if (!pending || pending.stage !== 'amount') return;

  const amount = parseFloat(amountText.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply('❌ Please enter a valid positive number. Try again or /cancel to abort.');
    return;
  }

  pending.amount = amount;
  pending.stage = 'review';

  // Build portfolio locally
  const mimicResult = getLocalMimicAllocation(pending.investorId, pending.ethicsEnabled);
  if (!mimicResult) {
    await ctx.reply(userSafeError());
    pendingMimic.delete(telegramId);
    return;
  }

  pending.holdings = mimicResult.holdings;
  pending.replacedTickers = mimicResult.replacedTickers;
  pendingMimic.set(telegramId, pending);

  // Save for later replacement commands
  lastMimic.set(telegramId, { investorId: pending.investorId, ethicsEnabled: pending.ethicsEnabled });

  Object.assign(ctx.state, { ticker: pending.investorId, apiDuration: 0, success: true });

  const holdings = pending.holdings;
  if (holdings.length === 0) {
    await ctx.replyWithMarkdown(
      `⚠️ *Mimic returned empty portfolio*\n\n` +
      `*Investor:* ${getInvestorName(pending.investorId)}\n` +
      `No holdings matched the criteria.`
    );
    pendingMimic.delete(telegramId);
    return;
  }

  // ─── FIRE & FORGET: start price fetch in background ──────────────────────
  pending.pricePromise = fetchMimicPrices(holdings, telegramId);
  pendingMimic.set(telegramId, pending);

  // Show allocation immediately (no prices yet)
  await showAllocationForReview(ctx, pending);
}

// ─── Show draft allocation (no prices yet, or partial prices) ──────────────

async function showAllocationForReview(ctx: Context, state: MimicState) {
  const holdings = state.holdings!;
  const amount = state.amount!;
  const investorName = getInvestorName(state.investorId);

  let totalAllocated = 0;
  const lines = holdings.map((h) => {
    const ticker = h.ticker || '?';
    const pct = h.percentage ?? 0;
    const dollarAmount = amount * (pct / 100);
    totalAllocated += dollarAmount;
    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    return `• *${ticker}* — ${pctStr} → $${dollarAmount.toFixed(2)}`;
  });

  let msg =
    `📋 *Draft Portfolio — ${investorName}*\n`;
  if (state.ethicsEnabled) msg += `🛡️ *Ethics filter: ON*\n`;
  if (state.replacedTickers && state.replacedTickers.length > 0) {
    msg += `🔄 *Replacements:* ${state.replacedTickers.map(r => `${r.old}→${r.new}`).join(', ')}\n`;
  }
  msg += `\n💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Suggested allocation:*\n${lines.join('\n')}\n\n` +
    `*Total Allocated:* ~$${totalAllocated.toFixed(2)}\n\n` +
    `⏳ *Fetching live prices in the background...*\n\n` +
    `Reply:\n` +
    `• \`confirm\` or \`yes\` — finalize with live prices when ready\n` +
    `• \`remove AAPL\` — swap a holding for a style-matched alternative\n` +
    `• \`add AAPL 10\` — add a stock with custom % (optional)\n`;

  await ctx.replyWithMarkdown(msg);
}

// ─── User responds during review stage ───────────────────────────────────────

export async function handleMimicReviewMessage(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;
  const state = pendingMimic.get(telegramId);
  if (!state || state.stage !== 'review') return false;

  const lower = text.trim().toLowerCase();

  // ── CONFIRM ─────────────────────────────────────────────────────────────
  if (/^(confirm|yes|ok|looks? good|approve|finalize)$/i.test(lower)) {
    await finalizeMimic(ctx, state);
    return true;
  }

  // ── REMOVE / REPLACE ────────────────────────────────────────────────────
  const removeMatch = text.match(/^(?:remove|drop|delete|swap out)\s+(\w+)$/i);
  const replaceMatch = text.match(/^replace\s+(\w+)\s+with\s+(\w+)$/i);

  if (removeMatch || replaceMatch) {
    const oldTicker = (removeMatch?.[1] || replaceMatch?.[1])!.toUpperCase();
    const newTicker = replaceMatch?.[2]?.toUpperCase();

    await ctx.replyWithChatAction('typing');

    const mimicResult = getLocalMimicAllocation(state.investorId, state.ethicsEnabled, [
      { oldTicker, newTicker },
    ]);

    if (!mimicResult || !mimicResult.replacedTickers || mimicResult.replacedTickers.length === 0) {
      await ctx.reply(`❌ Could not find a suitable replacement for *${oldTicker}*.`, { parse_mode: 'Markdown' });
      return true;
    }

    // Update state
    state.holdings = mimicResult.holdings;
    state.replacedTickers = [...(state.replacedTickers || []), ...mimicResult.replacedTickers];

    // Restart background price fetch for new holdings
    if (state.holdings) {
      state.pricePromise = fetchMimicPrices(state.holdings, telegramId);
    }
    pendingMimic.set(telegramId, state);

    await showAllocationForReview(ctx, state);
    return true;
  }

  // ── ADD (custom holding) ──────────────────────────────────────────────
  const addMatch = text.match(/^add\s+(\w+)\s+(\d+(?:\.\d+)?)$/i);
  if (addMatch) {
    const ticker = addMatch[1].toUpperCase();
    const pct = parseFloat(addMatch[2]);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      await ctx.reply('❌ Percentage must be between 0 and 100.');
      return true;
    }

    state.holdings!.push({ ticker, percentage: pct });
    // Normalize weights
    const total = state.holdings!.reduce((s, h) => s + h.percentage, 0);
    if (total > 0) {
      state.holdings = state.holdings!.map(h => ({ ...h, percentage: (h.percentage / total) * 100 }));
    }

    state.pricePromise = fetchMimicPrices(state.holdings!, telegramId);
    pendingMimic.set(telegramId, state);

    await showAllocationForReview(ctx, state);
    return true;
  }

  // Unknown command during review
  await ctx.reply(
    `🤔 I didn't understand that. During review you can:\n` +
    `• \`confirm\` — finalize\n` +
    `• \`remove AAPL\` — swap a holding\n` +
    `• \`add TSLA 15\` — add a stock with %\n` +
    `• \`/cancel\` — abort`
  );
  return true;
}

// ─── Finalize: merge prices (or show without if not ready) ─────────────────

async function finalizeMimic(ctx: Context, state: MimicState) {
  const telegramId = ctx.from?.id || 0;
  const holdings = state.holdings!;
  const amount = state.amount!;
  const investorName = getInvestorName(state.investorId);

  // Try to get prices — wait up to 10s if still fetching
  let priceMap = state.priceMap || new Map<string, number | null>();
  if (state.pricePromise && priceMap.size === 0) {
    try {
      priceMap = await Promise.race([
        state.pricePromise,
        new Promise<Map<string, number | null>>((resolve) =>
          setTimeout(() => resolve(new Map()), 10000)
        ),
      ]);
    } catch (err) {
      logger.warn('Price fetch failed during finalize', { error: (err as Error).message });
    }
  }

  pendingMimic.delete(telegramId);

  let totalAllocated = 0;
  const lines = holdings.map((h) => {
    const ticker = h.ticker || '?';
    const pct = h.percentage ?? 0;
    const dollarAmount = amount * (pct / 100);
    totalAllocated += dollarAmount;

    const price = priceMap.get(ticker);
    let detail = `$${dollarAmount.toFixed(2)}`;
    if (price && price > 0) {
      const shares = dollarAmount / price;
      const sharesStr = shares >= 1 ? shares.toFixed(2) : shares.toFixed(4);
      detail = `${sharesStr} shares @ $${price.toFixed(2)}`;
    }

    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    return `• *${ticker}* — ${pctStr} → ${detail}`;
  });

  let msg = `✅ *Final Portfolio — ${investorName}*\n`;
  if (state.ethicsEnabled) msg += `🛡️ *Ethics filter: ON*\n`;
  if (state.replacedTickers && state.replacedTickers.length > 0) {
    msg += `🔄 *Replacements:* ${state.replacedTickers.map(r => `${r.old}→${r.new}`).join(', ')}\n`;
  }
  msg += `\n💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Holdings:*\n${lines.join('\n')}\n\n` +
    `*Total Allocated:* ~$${totalAllocated.toFixed(2)}`;

  const allNull = [...priceMap.values()].every(v => v === null);
  if (priceMap.size === 0 || allNull) {
    msg += `\n\n⚠️ _Live prices unavailable — showing dollar allocations only._`;
  } else if ([...priceMap.values()].some(v => v === null)) {
    msg += `\n\nℹ️ _Some prices still loading — refresh for latest._`;
  }

  msg += `\n\n_Type \`remove TICKER\` to adjust this portfolio later._`;

  await ctx.replyWithMarkdown(msg);
}

// ─── Handle "remove X" outside the active flow (uses lastMimic) ────────────

export async function handleMimicReplacement(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;

  // If user is in review stage, route through the new handler
  const state = pendingMimic.get(telegramId);
  if (state && state.stage === 'review') {
    return handleMimicReviewMessage(ctx, text);
  }

  // Legacy: parse "replace AAPL", "remove AAPL", etc. outside review
  const autoMatch = text.match(/^(?:replace|remove|don't like|hate|swap out|drop)\s+(\w+)$/i);
  const explicitMatch = text.match(/^replace\s+(\w+)\s+with\s+(\w+)$/i);

  let oldTicker: string | undefined;
  let newTicker: string | undefined;
  let autoReplaced = false;

  if (explicitMatch) {
    oldTicker = explicitMatch[1].toUpperCase();
    newTicker = explicitMatch[2].toUpperCase();
  } else if (autoMatch) {
    oldTicker = autoMatch[1].toUpperCase();
    autoReplaced = true;
  } else {
    return false;
  }

  const last = lastMimic.get(telegramId);
  if (!last) {
    await ctx.reply(
      `🔄 Run /mimic first to select an investor, then type \`remove ${oldTicker}\` to auto-replace.`
    );
    return true;
  }

  await ctx.replyWithChatAction('typing');

  if (autoReplaced && oldTicker) newTicker = undefined;

  const mimicResult = getLocalMimicAllocation(last.investorId, last.ethicsEnabled, [
    { oldTicker: oldTicker!, newTicker },
  ]);

  if (autoReplaced && oldTicker && (!mimicResult || !mimicResult.replacedTickers || mimicResult.replacedTickers.length === 0)) {
    await ctx.reply(`❌ Could not find a suitable replacement for *${oldTicker}* with the current filters.`, { parse_mode: 'Markdown' });
    return true;
  }

  if (!mimicResult) {
    await ctx.reply('❌ Could not build replacement portfolio.');
    return true;
  }

  const investorName = getInvestorName(last.investorId);
  const holdings = mimicResult.holdings;

  const priceMap = await fetchMimicPrices(holdings, telegramId);

  const lines = holdings.map((h: any) => {
    const ticker = h.ticker || h.symbol || '?';
    const pct = parseFloat(h.percentage ?? h.weight ?? 0);
    const price = priceMap.get(ticker);
    let detail = '';
    if (price && price > 0) detail = `@ $${price.toFixed(2)}`;
    const pctStr = typeof pct === 'number' ? `${pct.toFixed(1)}%` : `${pct}`;
    return `• *${ticker}* — ${pctStr} ${detail}`;
  });

  let msg = `🔄 *Updated ${investorName} Portfolio*\n`;
  if (mimicResult.ethicsApplied) msg += `🛡️ Ethics filter: ON\n`;
  msg += `\n*Holdings:*\n${lines.join('\n')}`;

  if (mimicResult.replacedTickers && mimicResult.replacedTickers.length > 0) {
    const r = mimicResult.replacedTickers[0];
    const reason = last.ethicsEnabled ? 'same sector & style, ethics-compliant' : 'same sector & style';
    msg += `\n\n✅ *Auto-replaced:* ${r.old} → ${r.new}\n_(${reason})_`;
  }

  msg += `\n\n_Type \`remove TICKER\` to swap another.`;

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

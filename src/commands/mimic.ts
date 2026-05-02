import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { logger } from '../utils/logger';
import { getLocalMimicAllocation, findReplacement, fetchMimicPrices, MimicResult } from '../services/mimic';
import { findReplacements } from '../services/screener';
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

// Tracks pending replacement options for inline keyboard selection
export const pendingReplacements = new Map<number, { oldTicker: string; candidates: string[] }>();

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

  // ── Try online API first ──
  let mimicResult: MimicResult | null = null;
  let apiDuration = 0;
  const apiRes = await stockwise.mimicInvestor(
    pending.investorId,
    amount,
    telegramId
  );
  apiDuration = apiRes.duration;
  if (!apiRes.error && apiRes.data) {
    const apiData = apiRes.data as any;
    if (Array.isArray(apiData.holdings) && apiData.holdings.length > 0) {
      mimicResult = {
        holdings: apiData.holdings.map((h: any) => ({
          ticker: h.ticker || h.symbol,
          percentage: parseFloat(h.percentage ?? h.weight ?? 0),
        })),
        investorName: apiData.investorName || investorName,
        ethicsApplied: apiData.ethicsApplied ?? pending.ethicsEnabled ?? false,
        replacedTickers: apiData.replacedTickers,
      };
      logger.info('Mimic portfolio built online', {
        investorId: pending.investorId,
        holdingsCount: mimicResult.holdings.length,
      });
    }
  }

  // ── Fallback to local sheet → screener → hardcoded ──
  if (!mimicResult) {
    logger.info('Online mimic failed, falling back to local', {
      investorId: pending.investorId,
      error: apiRes.error || 'empty holdings',
    });
    mimicResult = getLocalMimicAllocation(pending.investorId, pending.ethicsEnabled);
  }

  if (!mimicResult) {
    await ctx.reply(userSafeError());
    Object.assign(ctx.state, {
      ticker: pending.investorId,
      apiDuration,
      success: false,
      errorMessage: 'Local mimic allocation failed',
    });
    return;
  }

  Object.assign(ctx.state, { ticker: pending.investorId, apiDuration, success: true });

  const holdings = mimicResult.holdings;
  if (holdings.length === 0) {
    await ctx.replyWithMarkdown(
      `⚠️ *Mimic returned empty portfolio*\n\n` +
      `*Investor:* ${investorName}\n` +
      `*Amount:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
      `No holdings matched the criteria.`
    );
    return;
  }

  // Fetch prices for all holdings — with 15s timeout to avoid hanging on API failures
  let priceMap: Map<string, number | null>;
  try {
    priceMap = await Promise.race([
      fetchMimicPrices(holdings, telegramId),
      new Promise<Map<string, number | null>>((_, reject) =>
        setTimeout(() => reject(new Error('Price fetch timeout')), 15000)
      )
    ]);
  } catch {
    // If prices fail entirely, show allocation without share counts
    priceMap = new Map();
    for (const h of holdings) {
      priceMap.set(h.ticker, null);
    }
  }

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
    msg += `🔄 *Replacements:* ${mimicResult.replacedTickers.map((r: { old: string; new: string }) => `${r.old}→${r.new}`).join(', ')}\n`;
  }
  msg += `\n💵 *Investment:* $${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
    `*Suggested allocation:*\n${lines.join('\n')}\n\n` +
    `*Total Allocated:* ~$${totalAllocated.toFixed(2)}\n\n` +
    `_Reply with \`remove AAPL\` to auto-swap with a style-matched alternative._`;

  await ctx.replyWithMarkdown(msg);
}

export async function handleMimicReplacement(ctx: Context, text: string) {
  const telegramId = ctx.from?.id || 0;

  // Parse: "replace AAPL", "remove AAPL", "don't like AAPL", "replace AAPL with MSFT"
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

  // Explicit replacement: apply directly
  if (!autoReplaced && oldTicker && newTicker) {
    const mimicResult = getLocalMimicAllocation(last.investorId, last.ethicsEnabled, [
      { oldTicker: oldTicker!, newTicker },
    ]);
    if (!mimicResult) {
      await ctx.reply('❌ Could not build replacement portfolio.');
      return true;
    }
    await sendReplacementPortfolio(ctx, mimicResult, last.investorId, last.ethicsEnabled);
    return true;
  }

  // Auto-replace: find multiple candidates and show inline keyboard
  if (autoReplaced && oldTicker) {
    const candidates = findReplacements(oldTicker, last.investorId, last.ethicsEnabled, 3);
    if (candidates.length === 0) {
      await ctx.reply(`❌ Could not find a suitable replacement for *${oldTicker}* with the current filters.`, { parse_mode: 'Markdown' });
      return true;
    }

    pendingReplacements.set(telegramId, { oldTicker, candidates });

    const buttons = candidates.map(c =>
      Markup.button.callback(`🔄 Replace with ${c}`, `replace_select:${oldTicker}:${c}`)
    );
    buttons.push(Markup.button.callback('❌ Cancel', `replace_cancel:${oldTicker}`));

    await ctx.replyWithMarkdown(
      `*${getInvestorName(last.investorId)}* — replace *${oldTicker}* with:`,
      Markup.inlineKeyboard(buttons.map(b => [b]))
    );
    return true;
  }

  return false;
}

async function sendReplacementPortfolio(
  ctx: Context,
  mimicResult: any,
  investorId: string,
  ethicsEnabled: boolean
) {
  const telegramId = ctx.from?.id || 0;
  const investorName = getInvestorName(investorId);
  const holdings = mimicResult.holdings;

  // Fetch prices for all holdings — with 15s timeout
  let priceMap: Map<string, number | null>;
  try {
    priceMap = await Promise.race([
      fetchMimicPrices(holdings, telegramId),
      new Promise<Map<string, number | null>>((_, reject) =>
        setTimeout(() => reject(new Error('Price fetch timeout')), 15000)
      )
    ]);
  } catch {
    priceMap = new Map();
    for (const h of holdings) {
      priceMap.set(h.ticker, null);
    }
  }

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
    const r = mimicResult.replacedTickers[0];
    const reason = ethicsEnabled
      ? 'same sector & style, ethics-compliant'
      : 'same sector & style';
    msg += `\n\n✅ *Replaced:* ${r.old} → ${r.new}\n_(${reason})_`;
  }

  msg += `\n\n_Type \`remove TICKER\` to swap another._`;

  await ctx.replyWithMarkdown(msg);
}

export async function handleReplaceSelectCallback(ctx: Context) {
  const match = (ctx as any).match as RegExpExecArray;
  if (!match) return;

  const oldTicker = match[1].toUpperCase();
  const newTicker = match[2].toUpperCase();
  const telegramId = ctx.from?.id || 0;

  await ctx.answerCbQuery(`Replacing ${oldTicker} with ${newTicker}...`);

  const last = lastMimic.get(telegramId);
  if (!last) {
    await ctx.editMessageText('⚠️ Session expired. Run /mimic again.');
    return;
  }

  pendingReplacements.delete(telegramId);

  const mimicResult = getLocalMimicAllocation(last.investorId, last.ethicsEnabled, [
    { oldTicker, newTicker },
  ]);

  if (!mimicResult) {
    await ctx.editMessageText('❌ Could not build replacement portfolio.');
    return;
  }

  await sendReplacementPortfolio(ctx, mimicResult, last.investorId, last.ethicsEnabled);
}

export async function handleReplaceCancelCallback(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  pendingReplacements.delete(telegramId);
  await ctx.answerCbQuery('Cancelled.');
  await ctx.editMessageText('❌ Replacement cancelled.');
}

function getInvestorName(investorId: string): string {
  if (investorId.startsWith('congress:')) {
    const id = investorId.replace('congress:', '');
    return loadCongressTraders()[id]?.name || 'Unknown Trader';
  }
  return INVESTORS.find(i => i.id === investorId)?.name || 'Unknown Investor';
}

import { Context, Markup } from 'telegraf';
import { BotContext } from '../types';
import { validateTicker, sanitizeTicker } from '../utils/validation';
import { logChatIntent } from '../db';
import { scoreCommand } from './score';
import { searchCommand } from './search';
import { newsCommand } from './news';
import { portfolioCommand } from './portfolio';
import { watchlistCommand, watchlistAddCommand, watchlistRemoveCommand } from './watchlist';
import { mimicCommand, pendingMimic, runMimicFromAmount, handleMimicReplacement } from './mimic';
import { alertCommand } from './alert';
import { helpCommand } from './help';
import { simulateCommand } from './simulate';
import { metricsCommand } from './metrics';
import { runExperimentFromText, pendingExperiment } from './experiment';
import { stockwise } from '../api/stockwise';
import { yahooSearch } from '../api/yahoo';

// Common English words that could be mistaken for tickers
const COMMON_WORDS = new Set([
  'A','I','AN','AS','AT','BE','BY','DO','GO','HE','IF','IN','IS','IT','ME','MY','NO','OF','ON','OR',
  'SO','TO','UP','US','WE','ALL','AND','ARE','BUT','CAN','FOR','HAD','HAS','HER','HIM','HIS','HOW',
  'ITS','NEW','NOT','NOW','OFF','OLD','ONE','OUR','OUT','SEE','SHE','THE','TWO','USE','WAY','WHO',
  'YES','YET','YOU','THEY','THEM','THAN','THEN','THAT','THIS','WILL','WITH','HAVE','FROM','HERE',
  'WANT','BEEN','WERE','SAID','EACH','WHICH','THEIR','TIME','VERY','WHEN','MUCH','WOULD','THERE',
  'ABOUT','OTHER','RIGHT','FIRST','ALSO','AFTER','BACK','ONLY','KNOW','TAKE','YEAR','GOOD','SOME',
  'COME','MAKE','WELL','WORK','EVEN','MORE','LONG','WHAT','FIND','GIVE','MOST','OVER','SUCH','THINK',
  'WHERE','BEING','EVERY','GREAT','MIGHT','SHALL','STILL','THOSE','WHILE','COULD','STATE','NEVER',
  'REALLY','SHOULD','THROUGH','BECAUSE','BEFORE','LITTLE','PEOPLE','AROUND','DURING','PLACE','THESE'
]);

function extractTickerCandidates(text: string): string[] {
  const candidates: string[] = [];

  // Pattern 1: $TICKER
  const dollarMatches = text.match(/\$([A-Z]{1,5})/gi);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      const ticker = m.replace('$', '').toUpperCase();
      if (validateTicker(ticker)) candidates.push(ticker);
    }
  }

  // Pattern 2: standalone 2-5 letter uppercase words (exclude common words)
  const wordMatches = text.match(/\b[A-Z]{1,5}\b/g);
  if (wordMatches) {
    for (const m of wordMatches) {
      const ticker = m.toUpperCase();
      if (ticker.length >= 2 && !COMMON_WORDS.has(ticker) && validateTicker(ticker)) {
        if (!candidates.includes(ticker)) candidates.push(ticker);
      }
    }
  }

  return candidates;
}

function isTickerOnly(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\$?([A-Z0-9.\-]{1,20})$/i);
  if (match) {
    const ticker = sanitizeTicker(match[1]);
    if (validateTicker(ticker) && !COMMON_WORDS.has(ticker)) {
      return ticker;
    }
  }
  return null;
}

// Simulate a command context by overriding ctx.message.text
async function runAsCommand(ctx: Context, commandText: string, handler: (ctx: Context) => Promise<void>) {
  const originalText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (ctx.message && 'text' in ctx.message) {
    (ctx.message as any).text = commandText;
  }
  try {
    await handler(ctx);
  } finally {
    if (ctx.message && 'text' in ctx.message) {
      (ctx.message as any).text = originalText;
    }
  }
}

function recordIntent(
  ctx: Context,
  intent: string,
  opts: { ticker?: string; command?: string; isFallback?: boolean } = {}
) {
  const telegramId = ctx.from?.id || 0;
  const rawMessage = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  return logChatIntent({
    telegramId,
    rawMessage,
    detectedIntent: intent,
    extractedTicker: opts.ticker,
    executedCommand: opts.command,
    isFallback: opts.isFallback || false,
  });
}

export async function handleChatMessage(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const lower = text.toLowerCase().trim();
  const tickers = extractTickerCandidates(text);
  const firstTicker = tickers[0];

  // 0. Replacement / removal commands (remove AAPL, don't like AAPL, replace AAPL with MSFT)
  if (!text.startsWith('/') && /^(replace|remove|don't like|hate|swap out|drop)\s+/i.test(text)) {
    const handled = await handleMimicReplacement(ctx, text.trim());
    if (handled) return;
  }

  // 1. Pending flows (experiment, mimic amount)
  const telegramId = ctx.from?.id || 0;

  if (!text.startsWith('/') && pendingMimic.has(telegramId)) {
    recordIntent(ctx, 'mimic', { command: 'mimic' });
    await runMimicFromAmount(ctx, text.trim());
    return;
  }

  // If user sends an amount-looking number but mimic state was lost (redeploy), tell them to restart
  if (!text.startsWith('/') && /^\$?\d+[\d,]*\.?\d*\s*$/.test(text.trim())) {
    await ctx.reply(
      `⚠️ Your mimic session expired (bot restarted).\n\n` +
      `Please run /mimic again to select an investor and enter your amount.`
    );
    return;
  }

  if (!text.startsWith('/') && lower.startsWith('exp:')) {
    recordIntent(ctx, 'experiment', { command: 'experiment' });
    await runExperimentFromText(ctx, text.slice(4).trim());
    return;
  }
  if (!text.startsWith('/') && pendingExperiment.has(telegramId)) {
    pendingExperiment.delete(telegramId);
    recordIntent(ctx, 'experiment', { command: 'experiment' });
    await runExperimentFromText(ctx, text.trim());
    return;
  }

  // 2. Ticker-only message → score
  const tickerOnly = isTickerOnly(text);
  if (tickerOnly) {
    recordIntent(ctx, 'ticker_score', { ticker: tickerOnly, command: 'score' });
    await runAsCommand(ctx, `/score ${tickerOnly}`, scoreCommand);
    return;
  }

  // 3. Natural language parsing

  // Help / commands
  if (/\b(help|commands|what can you do|how to use|menu)\b/i.test(lower)) {
    recordIntent(ctx, 'help', { command: 'help' });
    await helpCommand(ctx);
    return;
  }

  // Portfolio
  if (/\b(my portfolio|show portfolio|view portfolio|portfolio)\b/i.test(lower)) {
    recordIntent(ctx, 'portfolio', { command: 'portfolio' });
    await portfolioCommand(ctx);
    return;
  }

  // Watchlist (show only)
  if (/\b(my watchlist|show watchlist|view watchlist|watchlist)\b/i.test(lower)) {
    if (!/\b(add|remove|delete)\b/i.test(lower)) {
      recordIntent(ctx, 'watchlist', { command: 'watchlist' });
      await watchlistCommand(ctx);
      return;
    }
  }

  // Simulate / Monte Carlo
  if (/\b(simulate|monte carlo|projection|forecast|predict)\b/i.test(lower)) {
    if (firstTicker) {
      recordIntent(ctx, 'simulate', { ticker: firstTicker, command: 'simulate' });
      await runAsCommand(ctx, `/simulate ${firstTicker}`, simulateCommand);
      return;
    }
  }

  // Metrics / risk stats
  if (/\b(metrics|risk|volatility|sharpe|drawdown|var|statistics|stats)\b/i.test(lower)) {
    if (firstTicker) {
      recordIntent(ctx, 'metrics', { ticker: firstTicker, command: 'metrics' });
      await runAsCommand(ctx, `/metrics ${firstTicker}`, metricsCommand);
      return;
    }
  }

  // Mimic
  if (/\b(mimic|copy investor|copy portfolio|investor strategy|follow investor)\b/i.test(lower)) {
    recordIntent(ctx, 'mimic', { command: 'mimic' });
    await mimicCommand(ctx);
    return;
  }

  // Alert with ticker + condition + price
  const alertMatch = text.match(
    /(?:alert|notify|tell me).{0,20}?\b([A-Z]{1,5})\b.{0,10}?\b(above|below|over|under|higher than|lower than)\b.{0,10}?\$?(\d+(?:\.\d+)?)/i
  ) || text.match(
    /\b([A-Z]{1,5})\b.{0,10}?\b(above|below|over|under|higher than|lower than)\b.{0,10}?\$?(\d+(?:\.\d+)?)/i
  );

  if (alertMatch) {
    const ticker = alertMatch[1].toUpperCase();
    let condition = alertMatch[2].toLowerCase();
    const price = alertMatch[3];
    if (condition === 'over' || condition === 'higher than') condition = 'above';
    if (condition === 'under' || condition === 'lower than') condition = 'below';
    recordIntent(ctx, 'alert', { ticker, command: 'alert' });
    await runAsCommand(ctx, `/alert ${ticker} ${condition} ${price}`, alertCommand);
    return;
  }

  // Watchlist add
  const addMatch = lower.match(/(?:add|put)\s+(.+?)\s+(?:to\s+)?(?:my\s+)?watchlist/);
  if (addMatch && firstTicker) {
    recordIntent(ctx, 'watchlist_add', { ticker: firstTicker, command: 'watchlist_add' });
    await runAsCommand(ctx, `/watchlist_add ${firstTicker}`, watchlistAddCommand);
    return;
  }

  // Watchlist remove
  const removeMatch = lower.match(/(?:remove|delete)\s+(.+?)\s+(?:from\s+)?(?:my\s+)?watchlist/);
  if (removeMatch && firstTicker) {
    recordIntent(ctx, 'watchlist_remove', { ticker: firstTicker, command: 'watchlist_remove' });
    await runAsCommand(ctx, `/watchlist_remove ${firstTicker}`, watchlistRemoveCommand);
    return;
  }

  // News
  if (/\b(news|headlines|what\s+(?:is|are)\s+(?:the\s+)?news)/i.test(lower)) {
    if (firstTicker) {
      recordIntent(ctx, 'news', { ticker: firstTicker, command: 'news' });
      await runAsCommand(ctx, `/news ${firstTicker}`, newsCommand);
      return;
    }
  }

  // Score / opinion
  if (/\b(score|rating|opinion|what do you think|how is|analysis of|analyze)\b/i.test(lower)) {
    if (firstTicker) {
      recordIntent(ctx, 'score', { ticker: firstTicker, command: 'score' });
      await runAsCommand(ctx, `/score ${firstTicker}`, scoreCommand);
      return;
    }
  }

  // Search / find / look up
  if (/\b(search|find|look up|lookup|info on|information on|about)\b/i.test(lower)) {
    if (firstTicker) {
      recordIntent(ctx, 'search', { ticker: firstTicker, command: 'search' });
      await runAsCommand(ctx, `/search ${firstTicker}`, searchCommand);
      return;
    }
  }

  // If we have a ticker but no specific intent matched, default to score
  if (firstTicker) {
    recordIntent(ctx, 'default_score', { ticker: firstTicker, command: 'score' });
    await runAsCommand(ctx, `/score ${firstTicker}`, scoreCommand);
    return;
  }

  // 4. Company name search (e.g., "apple", "google")
  const wordCount = text.trim().split(/\s+/).length;
  if (/^[a-zA-Z0-9\s\.\&\-]+$/.test(text) && text.length > 1 && text.length < 40 && wordCount <= 4) {
    await ctx.replyWithChatAction('typing');

    let stocks = [] as any[];
    try {
      const { data, error } = await stockwise.searchStocks(text);
      if (!error && data) {
        stocks = Array.isArray(data) ? data : [data];
      }
    } catch {
      // ignore API errors, fall through to Yahoo
    }

    if (stocks.length > 0) {
      const lines = stocks.slice(0, 5).map((s: any) => {
        const price = s.price ? `$${s.price}` : 'Price N/A';
        return `• *${s.ticker || s.symbol}* — ${s.name || ''} (${price})`;
      });
      await ctx.replyWithMarkdown(
        `🔍 *Did you mean:*\n\n${lines.join('\n')}\n\n_Use /score <ticker> for details._`
      );
      return;
    }

    try {
      const yahoo = await yahooSearch(text);
      if (yahoo.data && yahoo.data.length > 0) {
        const lines = yahoo.data.slice(0, 6).map((q) => {
          const name = q.longname || q.shortname || '';
          return `• *${q.symbol}* — ${name} (${q.exchange || 'N/A'})`;
        });
        await ctx.replyWithMarkdown(
          `🔍 *Did you mean:*\n\n${lines.join('\n')}\n\n_Use /score <ticker> for details._`
        );
        return;
      }
    } catch {
      // ignore yahoo errors
    }

    await ctx.reply(`No results found for "${text}". Try /search <name> or a ticker like AAPL.`);
    return;
  }

  // 5. Fallback — log and ask for correction
  const logResult = recordIntent(ctx, 'fallback', { isFallback: true });
  const logId = logResult.lastInsertRowid as number;

  await ctx.reply(
    `🤖 I didn't catch that.\n\n` +
    `You can:\n` +
    `• Type a ticker like *AAPL* or *$TSLA* for a quick score\n` +
    `• Ask me *"news for AAPL"* or *"score of AAPL"*\n` +
    `• Use /help to see all commands\n\n` +
    `_What were you looking for?_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 Score', `correct_intent:score:${logId}`),
          Markup.button.callback('📰 News', `correct_intent:news:${logId}`),
        ],
        [
          Markup.button.callback('🔍 Search', `correct_intent:search:${logId}`),
          Markup.button.callback('⭐ Watchlist', `correct_intent:watchlist:${logId}`),
        ],
        [
          Markup.button.callback('💼 Portfolio', `correct_intent:portfolio:${logId}`),
          Markup.button.callback('🔔 Alert', `correct_intent:alert:${logId}`),
        ],
        [
          Markup.button.callback('🎲 Simulate', `correct_intent:simulate:${logId}`),
          Markup.button.callback('📐 Metrics', `correct_intent:metrics:${logId}`),
        ],
        [
          Markup.button.callback('🧠 Mimic', `correct_intent:mimic:${logId}`),
          Markup.button.callback('❓ Other', `correct_intent:other:${logId}`),
        ],
      ]),
    }
  );
}

import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { startCommand } from './start';
import { helpCommand } from './help';
import { newsCommand } from './news';
import { searchCommand } from './search';
import { scoreCommand } from './score';
import { watchlistCommand, watchlistAddCommand, watchlistRemoveCommand } from './watchlist';
import { portfolioCommand } from './portfolio';
import { mimicCommand, handleMimicCallback, handleMimicAmount } from './mimic';
import { experimentCommand, runExperimentFromText } from './experiment';
import { alertCommand } from './alert';
import { adminCommand, adminExportCommand } from './admin';
import { stockwise } from '../api/stockwise';
import { yahooSearch } from '../api/yahoo';
import { logEvent } from '../db';

export function registerCommands(bot: Telegraf<BotContext>) {
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('news', newsCommand);
  bot.command('search', searchCommand);
  bot.command('score', scoreCommand);
  bot.command('watchlist', watchlistCommand);
  bot.command('watchlist_add', watchlistAddCommand);
  bot.command('watchlist_remove', watchlistRemoveCommand);
  bot.command('portfolio', portfolioCommand);
  bot.command('mimic', mimicCommand);
  bot.command('experiment', experimentCommand);
  bot.command('alert', alertCommand);
  bot.command('alerts', alertCommand); // alias
  bot.command('admin', adminCommand);
  bot.command('admin_export', adminExportCommand);

  bot.command('cancel', async (ctx) => {
    if (ctx.session?.awaitingMimicAmount) {
      delete ctx.session.awaitingMimicAmount;
      await ctx.reply('❌ Cancelled.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  });

  // Inline callbacks
  bot.action(/^mimic_select:(.+)$/, handleMimicCallback);

  // Feedback callbacks
  bot.action(/^feedback:(.+):(.+)$/, async (ctx) => {
    const match = ctx.match as RegExpExecArray;
    const eventId = parseInt(match[1], 10);
    const rating = parseInt(match[2], 10);
    const { saveFeedback } = await import('../db');
    saveFeedback(ctx.from?.id || 0, eventId, rating);
    await ctx.answerCbQuery('Thanks for your feedback!');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  // General text handler
  bot.hears(/.+/, async (ctx) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const telegramId = ctx.from?.id || 0;

    // 1. Handle mimic amount input
    if (ctx.session?.awaitingMimicAmount) {
      await handleMimicAmount(ctx, text);
      return;
    }

    // 2. Skip commands
    if (text.startsWith('/')) return;

    // 3. Experiment formula detection
    if (text.includes('=') || text.includes('>') || text.includes('<')) {
      await runExperimentFromText(ctx, text);
      return;
    }

    // 4. Ticker suggestion for company names (e.g., "apple", "google")
    if (/^[a-zA-Z0-9\s\.\&\-]+$/.test(text) && text.length > 1 && text.length < 40) {
      await ctx.replyWithChatAction('typing');

      // Try StockWisePro backend first
      const { data, duration, error } = await stockwise.searchStocks(text);
      logEvent({ telegramId, command: 'text_search', ticker: text, apiResponseTimeMs: duration, success: !error });

      let stocks = [] as any[];
      if (!error && data) {
        stocks = Array.isArray(data) ? data : [data];
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

      // Fallback to Yahoo Finance
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

      await ctx.reply(`No results found for "${text}". Try /search <name> or a ticker like AAPL.`);
    }
  });
}

import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';
import { getLocalWatchlist, addLocalWatchlistItem, removeLocalWatchlistItem } from '../db';

export async function watchlistCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getWatchlist(telegramId);
  (ctx as BotContext).state = { apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  let items = Array.isArray(data) ? data : [];

  // Fallback to local SQLite if API fails or returns empty
  if (error || items.length === 0) {
    const localItems = getLocalWatchlist(telegramId);
    if (localItems.length > 0) {
      items = localItems.map(l => ({ ticker: l.ticker }));
      (ctx as BotContext).state.success = true;
    }
  }

  if (items.length === 0) {
    await ctx.reply('Your watchlist is empty.\nUse /search to find stocks, then ask me to add them (e.g., "add AAPL to watchlist").');
    return;
  }

  const lines = items.map((w: any) => {
    const t = w.ticker || w.stock?.ticker || '?';
    const p = w.stock?.price ? `$${w.stock.price}` : '';
    return `• *${t}* ${p}`;
  });

  await ctx.replyWithMarkdown(`⭐ *Your Watchlist*\n\n${lines.join('\n')}`);
}

export async function watchlistAddCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace(/^(\/watchlist_add|add)\s+/i, '').trim().toUpperCase();
  const telegramId = ctx.from?.id || 0;

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /watchlist_add <ticker>');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.addToWatchlist(ticker, telegramId);
  Object.assign(ctx.state, { ticker, apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  // Always save to local SQLite as backup
  addLocalWatchlistItem(telegramId, ticker);

  if (error) {
    await ctx.reply(`✅ Added *${ticker}* to your local watchlist. (StockWise API is currently unavailable)`, { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply(`✅ Added *${ticker}* to your watchlist.`, { parse_mode: 'Markdown' });
}

export async function watchlistRemoveCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace(/^(\/watchlist_remove|remove)\s+/i, '').trim().toUpperCase();
  const telegramId = ctx.from?.id || 0;

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /watchlist_remove <ticker>\nExample: /watchlist_remove AAPL');
    return;
  }

  // Always remove from local SQLite first
  removeLocalWatchlistItem(telegramId, ticker);

  // Find the watchlist item by ticker so we can remove it by ID via API
  const { data: listData, error: listError } = await stockwise.getWatchlist(telegramId);
  if (!listError && Array.isArray(listData)) {
    const item = listData.find((w: any) => {
      const t = (w.ticker || w.stock?.ticker || '').toUpperCase();
      return t === ticker;
    });

    if (item) {
      const { duration, error } = await stockwise.removeFromWatchlist(item.id, telegramId);
      Object.assign(ctx.state, { ticker, apiDuration: duration, success: !error });
      if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
    }
  }

  await ctx.reply(`✅ Removed *${ticker}* from your watchlist.`, { parse_mode: 'Markdown' });
}

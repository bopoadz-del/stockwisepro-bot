import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { userSafeError } from '../utils/logger';
import { validateTicker } from '../utils/validation';

export async function watchlistCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getWatchlist(telegramId);
  (ctx as BotContext).state = { apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  const items = Array.isArray(data) ? data : [];
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
  (ctx as BotContext).state = { ticker, apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
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

  // Find the watchlist item by ticker so we can remove it by ID
  const { data: listData, error: listError } = await stockwise.getWatchlist(telegramId);
  if (listError || !Array.isArray(listData)) {
    await ctx.reply(`❌ Could not load watchlist: ${JSON.stringify(listError)}`);
    return;
  }

  const item = listData.find((w: any) => {
    const t = (w.ticker || w.stock?.ticker || '').toUpperCase();
    return t === ticker;
  });

  if (!item) {
    await ctx.reply(`❌ *${ticker}* is not in your watchlist.`, { parse_mode: 'Markdown' });
    return;
  }

  const { data, duration, error } = await stockwise.removeFromWatchlist(item.id, telegramId);
  (ctx as BotContext).state = { ticker, apiDuration: duration, success: !error };
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  if (error) {
    await ctx.reply(userSafeError());
    return;
  }

  await ctx.reply(`✅ Removed *${ticker}* from your watchlist.`, { parse_mode: 'Markdown' });
}

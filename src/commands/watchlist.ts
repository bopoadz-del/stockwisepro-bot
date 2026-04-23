import { Context } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';

export async function watchlistCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  await ctx.replyWithChatAction('typing');

  const { data, duration, error } = await stockwise.getWatchlist();
  logEvent({ telegramId, command: '/watchlist', apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Error: ${JSON.stringify(error)}`);
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

  if (!ticker) {
    await ctx.reply('Usage: /watchlist_add <ticker>');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.addToWatchlist(ticker);
  logEvent({ telegramId, command: '/watchlist_add', ticker, apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Could not add ${ticker}: ${JSON.stringify(error)}`);
    return;
  }

  await ctx.reply(`✅ Added *${ticker}* to your watchlist.`, { parse_mode: 'Markdown' });
}

export async function watchlistRemoveCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const idStr = text.replace(/^(\/watchlist_remove|remove)\s+/i, '').trim();
  const telegramId = ctx.from?.id || 0;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    await ctx.reply('Usage: /watchlist_remove <id>. Use /watchlist to see IDs.');
    return;
  }

  const { data, duration, error } = await stockwise.removeFromWatchlist(id);
  logEvent({ telegramId, command: '/watchlist_remove', apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ Could not remove: ${JSON.stringify(error)}`);
    return;
  }

  await ctx.reply('✅ Removed from watchlist.');
}

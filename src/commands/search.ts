import { Context } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { logEvent } from '../db';

export async function searchCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const query = text.replace('/search', '').trim();
  const telegramId = ctx.from?.id || 0;

  if (!query) {
    await ctx.reply('Usage: /search <ticker or name>\nExample: /search AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, duration, error } = await stockwise.searchStocks(query);

  logEvent({ telegramId, command: '/search', ticker: query, apiResponseTimeMs: duration, success: !error });

  if (error || !data) {
    await ctx.reply(`❌ Search failed: ${JSON.stringify(error)}`);
    return;
  }

  const stocks = Array.isArray(data) ? data : [data];
  if (stocks.length === 0) {
    await ctx.reply('No stocks found for that query.');
    return;
  }

  const lines = stocks.slice(0, 5).map((s: any) => {
    const price = s.price ? `$${s.price}` : 'Price N/A';
    return `• *${s.ticker || s.symbol}* — ${s.name || ''} (${price})`;
  });

  await ctx.replyWithMarkdownV2(`🔍 *Search results for "${query}"*:\n\n${lines.join('\n')}`);
}

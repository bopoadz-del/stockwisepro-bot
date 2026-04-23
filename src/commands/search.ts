import { Context } from 'telegraf';
import { stockwise } from '../api/stockwise';
import { brave } from '../api/brave';
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

  let stocks = [] as any[];
  let usedBrave = false;

  if (!error && data) {
    stocks = Array.isArray(data) ? data : [data];
  }

  // Fallback to Brave Search if StockWisePro fails or returns empty
  if (stocks.length === 0) {
    const braveRes = await brave.webSearch(`${query} stock ticker`, 5);
    logEvent({ telegramId, command: '/search_brave', ticker: query, apiResponseTimeMs: braveRes.duration, success: !braveRes.error });

    if (!braveRes.error && braveRes.data.length > 0) {
      usedBrave = true;
      const lines = braveRes.data.slice(0, 5).map((s: any, i: number) => {
        return `${i + 1}. *${s.title || 'No title'}*\n   ${s.url || ''}`;
      });
      await ctx.replyWithMarkdown(`🔍 *Web results for "${query}"* (via Brave):\n\n${lines.join('\n')}`);
      return;
    }
  }

  if (stocks.length === 0) {
    await ctx.reply('No stocks found for that query.');
    return;
  }

  const lines = stocks.slice(0, 5).map((s: any) => {
    const price = s.price ? `$${s.price}` : 'Price N/A';
    return `• *${s.ticker || s.symbol}* — ${s.name || ''} (${price})`;
  });

  await ctx.replyWithMarkdown(`🔍 *Search results for "${query}"*:\n\n${lines.join('\n')}`);
}

import { Context } from 'telegraf';
import { BotContext } from '../types';
import { stockwise } from '../api/stockwise';
import { brave } from '../api/brave';
import { duckduckgo } from '../api/duckduckgo';
import { yahooSearch } from '../api/yahoo';
import { userSafeError } from '../utils/logger';


export async function searchCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const query = text.replace('/search', '').trim();
  const telegramId = ctx.from?.id || 0;

  if (!query) {
    await ctx.reply('Usage: /search <ticker or name>\nExample: /search AAPL or /search Apple');
    return;
  }

  await ctx.replyWithChatAction('typing');

  // 1. Try StockWisePro backend first
  const { data, duration, error } = await stockwise.searchStocks(query, telegramId);
  Object.assign(ctx.state, { ticker: query, apiDuration: duration, success: !error });
  if (error) (ctx as BotContext).state.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

  let stocks = [] as any[];
  if (!error && data) {
    stocks = Array.isArray(data) ? data : [data];
  }

  if (stocks.length > 0) {
    const lines = stocks.slice(0, 5).map((s: any) => {
      const price = s.price ? `$${s.price}` : 'Price N/A';
      return `• *${s.ticker || s.symbol}* — ${s.name || ''} (${price})`;
    });
    await ctx.replyWithMarkdown(`🔍 *Search results for "${query}"*:\n\n${lines.join('\n')}`);
    return;
  }

  // 2. Fallback to Yahoo Finance fuzzy search
  await ctx.replyWithChatAction('typing');
  const yahoo = await yahooSearch(query);

  if (yahoo.data && yahoo.data.length > 0) {
    const lines = yahoo.data.slice(0, 6).map((q: any) => {
      const name = q.longname || q.shortname || '';
      return `• *${q.symbol}* — ${name} (${q.exchange || 'N/A'})`;
    });
    await ctx.replyWithMarkdown(`🔍 *Fuzzy matches for "${query}"* (via Yahoo):\n\n${lines.join('\n')}\n\n_Use /score <ticker> for details._`);
    return;
  }

  // 3. Fallback to Brave web search
  await ctx.replyWithChatAction('typing');
  const braveRes = await brave.webSearch(`${query} stock ticker`, 5);

  if (!braveRes.error && braveRes.data.length > 0) {
    const lines = braveRes.data.slice(0, 5).map((s: any, i: number) => {
      return `${i + 1}. *${s.title || 'No title'}*\n   ${s.url || ''}`;
    });
    await ctx.replyWithMarkdown(`🔍 *Web results for "${query}"* (via Brave):\n\n${lines.join('\n')}`);
    return;
  }

  // 4. Final fallback to DuckDuckGo web search
  await ctx.replyWithChatAction('typing');
  const ddgRes = await duckduckgo.webSearch(`${query} stock ticker`, 5);

  if (!ddgRes.error && ddgRes.data.length > 0) {
    const lines = ddgRes.data.slice(0, 5).map((s: any, i: number) => {
      const desc = s.description ? s.description.slice(0, 120) + (s.description.length > 120 ? '…' : '') : '';
      return `${i + 1}. *${s.title || 'No title'}*\n   _${desc}_\n   ${s.url || ''}`;
    });
    await ctx.replyWithMarkdown(`🔍 *Web results for "${query}"* (via DuckDuckGo):\n\n${lines.join('\n\n')}`);
    return;
  }

  await ctx.reply(userSafeError());
}

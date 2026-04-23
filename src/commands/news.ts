import { Context } from 'telegraf';
import { brave } from '../api/brave';
import { logEvent } from '../db';

export async function newsCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const query = text.replace('/news', '').trim();
  const telegramId = ctx.from?.id || 0;

  if (!query) {
    await ctx.reply('Usage: /news <ticker or topic>\nExample: /news AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const searchQuery = `${query} stock`;
  const { data, duration, error } = await brave.newsSearch(searchQuery, 5);

  logEvent({ telegramId, command: '/news', ticker: query, apiResponseTimeMs: duration, success: !error });

  if (error) {
    await ctx.reply(`❌ News search failed: ${JSON.stringify(error)}`);
    return;
  }

  if (!data || data.length === 0) {
    await ctx.reply('No news found for that query.');
    return;
  }

  const lines = data.slice(0, 5).map((item: any, i: number) => {
    const title = item.title || 'No title';
    const source = item.meta_url?.netloc || item.age || '';
    const url = item.url || '';
    return `${i + 1}. *${title}*\n${source ? `   📰 ${source}\n` : ''}${url ? `   🔗 ${url}\n` : ''}`;
  });

  const msg = `📰 *News for "${query}"*\n\n${lines.join('\n')}`;
  await ctx.replyWithMarkdown(msg);
}

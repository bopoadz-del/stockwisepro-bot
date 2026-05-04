import { Context } from 'telegraf';
import { duckduckgo } from '../api/duckduckgo';
import { userSafeError } from '../utils/logger';

export async function websearchCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const query = text.replace('/websearch', '').trim();

  if (!query) {
    await ctx.reply('Usage: /websearch <query>\nExample: /websearch Apple stock outlook 2026');
    return;
  }

  await ctx.replyWithChatAction('typing');
  const { data, error } = await duckduckgo.webSearch(query, 5);

  if (error || data.length === 0) {
    await ctx.reply(userSafeError());
    return;
  }

  const lines = data.map((r: any, i: number) => {
    const desc = r.description ? r.description.slice(0, 120) + (r.description.length > 120 ? '…' : '') : '';
    return `${i + 1}. *${r.title}*\n   _${desc}_\n   ${r.url}`;
  });

  await ctx.replyWithMarkdown(`🌐 *Web results for "${query}"* (via DuckDuckGo):\n\n${lines.join('\n\n')}`);
}

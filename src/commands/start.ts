import { Context, Markup } from 'telegraf';
import { ensureUser } from '../db';

export async function startCommand(ctx: Context) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const welcome = `
🚀 *Welcome to StockWiseBot!*

Your AI-powered stock research companion.

*Quick commands:*
🔍 /search <ticker> — Lookup a stock
📊 /score <ticker> — Get AI scoring
⭐ /watchlist — Manage watchlist
💼 /portfolio — View portfolio
🧠 /mimic — Copy legendary investors
🧪 /experiment — Test scoring formulas
🔔 /alert — Price alerts
📈 /help — Full command list

_Built for experimental research. Data is logged to improve scoring accuracy._
  `.trim();

  await ctx.replyWithMarkdown(welcome, Markup.removeKeyboard());
}

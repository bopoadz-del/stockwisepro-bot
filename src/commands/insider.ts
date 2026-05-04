import { Context } from 'telegraf';
import { fmp } from '../api/fmp';
import { validateTicker } from '../utils/validation';

export async function insiderCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace('/insider', '').trim().toUpperCase();

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /insider <ticker>\nExample: /insider AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const trades = await fmp.getInsiderTrading(ticker, 10);

  if (trades.length === 0) {
    await ctx.reply(`📭 No recent insider trades found for ${ticker}.`);
    return;
  }

  const lines: string[] = [];
  lines.push(`🏛 *Recent Insider Activity: ${ticker}*\n`);

  let purchaseCount = 0;
  let saleCount = 0;

  for (const t of trades.slice(0, 8)) {
    const isBuy = t.acquisitionOrDisposition === 'A' || t.transactionType?.includes('Purchase');
    const isSale = t.acquisitionOrDisposition === 'D' || t.transactionType?.includes('Sale');
    if (isBuy) purchaseCount++;
    if (isSale) saleCount++;

    const emoji = isBuy ? '🟢' : isSale ? '🔴' : '⚪';
    const action = isBuy ? 'BUY' : isSale ? 'SELL' : t.transactionType || 'TRADE';
    const shares = t.securitiesTransacted ? `${t.securitiesTransacted.toLocaleString()} shares` : '';
    const date = t.transactionDate || t.filingDate || '';
    const name = t.reportingName || 'Unknown';

    lines.push(`${emoji} *${action}* — ${name}`);
    if (shares) lines.push(`   ${shares} @ ${t.price ? '$' + t.price.toFixed(2) : '—'} | ${date}`);
    else lines.push(`   ${date}`);
    lines.push('');
  }

  const netSignal = purchaseCount > saleCount ? '🟢 Net Buying' : saleCount > purchaseCount ? '🔴 Net Selling' : '⚪ Mixed';
  lines.push(`📊 Signal: ${netSignal} (${purchaseCount} buys, ${saleCount} sales)`);

  const msg = lines.join('\n');
  try {
    await ctx.replyWithMarkdown(msg);
  } catch {
    await ctx.reply(msg);
  }
}

import { Context } from 'telegraf';
import { fmp } from '../api/fmp';
import { validateTicker } from '../utils/validation';

function fmtUSD(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '$—';
  return '$' + n.toFixed(2);
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—%';
  const pct = n * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export async function dcfCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace('/dcf', '').trim().toUpperCase();

  if (!ticker || !validateTicker(ticker)) {
    await ctx.reply('Usage: /dcf <ticker>\nExample: /dcf AAPL');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const [dcf, quote] = await Promise.all([
    fmp.getDCF(ticker),
    fmp.getQuote(ticker),
  ]);

  if (!dcf) {
    await ctx.reply(`❌ Could not retrieve DCF data for ${ticker}.\n\nFMP may not cover this ticker or the API key is missing.`);
    return;
  }

  const stockPrice = dcf['Stock Price'];
  const dcfValue = dcf.dcf;
  const upside = stockPrice > 0 ? (dcfValue - stockPrice) / stockPrice : 0;
  const emoji = upside >= 0.1 ? '🟢 Undervalued' : upside <= -0.1 ? '🔴 Overvalued' : '⚪ Fairly valued';

  const lines = [
    `📊 *DCF Valuation: ${ticker}*`,
    ``,
    `💵 Current Price: ${fmtUSD(stockPrice)}`,
    `📈 DCF Fair Value: ${fmtUSD(dcfValue)}`,
    `📉 Upside / Downside: ${fmtPct(upside)}`,
    `🏷 Verdict: ${emoji}`,
    ``,
    `_Based on FMP discounted cash flow model._`,
  ];

  if (quote) {
    lines.push(``, `🏷 Market Cap: ${fmtUSD(quote.marketCap)} | PE: ${quote.pe || '—'}`);
  }

  const msg = lines.join('\n');
  try {
    await ctx.replyWithMarkdown(msg);
  } catch {
    await ctx.reply(msg);
  }
}

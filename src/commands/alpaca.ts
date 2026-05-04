import { Context } from 'telegraf';
import { alpaca } from '../api/alpaca';
import { logger } from '../utils/logger';

function fmtUSD(n: string | number | undefined): string {
  const val = typeof n === 'string' ? parseFloat(n) : Number(n);
  if (!Number.isFinite(val)) return '$—';
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: string | number | undefined): string {
  const val = typeof n === 'string' ? parseFloat(n) : Number(n);
  if (!Number.isFinite(val)) return '—%';
  const pct = val * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export async function alpacaCommand(ctx: Context) {
  if (!alpaca.enabled) {
    await ctx.reply(
      '🔑 Alpaca is not configured.\n\n' +
      'Set these environment variables to enable:\n' +
      '`ALPACA_API_KEY`\n' +
      '`ALPACA_SECRET_KEY`\n' +
      '`ALPACA_PAPER=true` (recommended for testing)'
    );
    return;
  }

  await ctx.replyWithChatAction('typing');

  const [account, positions] = await Promise.all([
    alpaca.getAccount(),
    alpaca.getPositions(),
  ]);

  if (!account) {
    await ctx.reply('❌ Could not reach Alpaca. Check your API keys or try again later.');
    return;
  }

  const lines: string[] = [];
  lines.push(`🏦 *Alpaca Account*`);
  lines.push(`Status: ${account.status}`);
  lines.push(`Buying Power: ${fmtUSD(account.buying_power)}`);
  lines.push(`Equity: ${fmtUSD(account.equity)}`);
  lines.push(`Cash: ${fmtUSD(account.cash)}`);
  lines.push(`Portfolio Value: ${fmtUSD(account.portfolio_value)}`);
  lines.push(`Daytrades: ${account.daytrade_count}`);

  if (positions.length === 0) {
    lines.push(`\n📭 No open positions.`);
  } else {
    lines.push(`\n📈 *Positions (${positions.length})*\n`);
    for (const pos of positions.slice(0, 15)) {
      const pl = fmtPct(pos.unrealized_plpc);
      const plEmoji = parseFloat(pos.unrealized_plpc) >= 0 ? '🟢' : '🔴';
      lines.push(
        `${plEmoji} *${pos.symbol}* — ${pos.qty} shares @ ${fmtUSD(pos.current_price)} ` +
        `| MV ${fmtUSD(pos.market_value)} | P/L ${pl}`
      );
    }
    if (positions.length > 15) {
      lines.push(`\n...and ${positions.length - 15} more.`);
    }
  }

  const msg = lines.join('\n');
  try {
    await ctx.replyWithMarkdown(msg);
  } catch {
    await ctx.reply(msg);
  }
}

import { Context } from 'telegraf';

export async function helpCommand(ctx: Context) {
  const help = `
📖 *StockWiseBot Commands*

*Research*
/search <ticker> — Search stocks
/score <ticker> — AI scoring & metrics
/simulate <ticker> <days> — Monte Carlo price simulation
/metrics <ticker> — Risk stats (vol, Sharpe, VaR, drawdown)

*Portfolio*
/watchlist — View watchlist
/watchlist_add <ticker> — Add stock
/watchlist_remove <ticker> — Remove stock
/portfolio — View your portfolio
/mimic — Copy investor strategy
📸 Send a screenshot — Bot parses tickers & scores them

*Tools*
/experiment — Test custom formulas
/alert — Set price alerts
/alerts — View your alerts

*Admin*
/admin — Usage stats
/admin_export — Download CSV analytics

*General*
/start — Welcome message
/help — This menu
  `.trim();

  await ctx.replyWithMarkdown(help);
}

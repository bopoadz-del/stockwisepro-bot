import { BotContext } from '../types';
import { ensureUser } from '../db';
import { t } from '../i18n';
import { langOf } from '../middleware/i18n';
import { computeMarketInsights, computeTickerInsight } from '../services/insights';

function pct(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}

function signed(n: number | null): string {
  if (n == null) return '—';
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}

function fmtPrice(p: number | null): string {
  return p == null ? '—' : `$${p.toFixed(2)}`;
}

/**
 * /insights          → market-wide digest (dataset size, signal accuracy, movers)
 * /insights AAPL     → per-ticker insight
 */
export async function insightsCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;
  ensureUser(from.id, from.username, from.first_name, from.last_name);
  const lang = langOf(ctx);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const arg = text.replace(/^\/insights(@\w+)?/, '').trim().split(/\s+/)[0]?.toUpperCase();

  if (arg) {
    const ins = computeTickerInsight(arg);
    if (!ins) {
      await ctx.replyWithMarkdown(t(lang, 'insights.noTicker', { ticker: arg }));
      return;
    }
    const lines = [
      t(lang, 'insights.tickerTitle', { ticker: ins.ticker }),
      '',
      t(lang, 'insights.samples', { samples: ins.samples }),
    ];
    if (ins.latest) {
      lines.push(t(lang, 'insights.latest', {
        score: ins.latest.score != null ? Math.round(ins.latest.score) : '—',
        signal: ins.latest.signal ?? '—',
        price: fmtPrice(ins.latest.price),
      }));
    }
    if (ins.scoreMin != null && ins.scoreMax != null) {
      lines.push(t(lang, 'insights.scoreRange', {
        min: Math.round(ins.scoreMin),
        max: Math.round(ins.scoreMax),
        avg: ins.scoreAvg != null ? Math.round(ins.scoreAvg) : '—',
      }));
    }
    lines.push(t(lang, 'insights.trend', { trend: signed(ins.scoreTrend) }));
    lines.push(t(lang, 'insights.accuracy', {
      rate: pct(ins.accuracy.hitRate),
      hits: ins.accuracy.hits,
      evaluated: ins.accuracy.evaluated,
    }));
    if (ins.recentAlerts.length > 0) {
      lines.push('', t(lang, 'insights.recentAlerts'));
      for (const a of ins.recentAlerts) {
        const arrow = a.direction === 'down' ? '🔻' : '🔺';
        const head = a.headline ? ` — ${a.headline}` : '';
        lines.push(`${arrow} ${a.changePct >= 0 ? '+' : ''}${a.changePct.toFixed(2)}% (${a.severity})${head}`);
      }
    }
    await ctx.replyWithMarkdown(lines.join('\n'));
    return;
  }

  const m = computeMarketInsights();
  if (m.dataset.snapshots < 5) {
    await ctx.replyWithMarkdown(`${t(lang, 'insights.title')}\n\n${t(lang, 'insights.notEnough')}`);
    return;
  }

  const lines = [
    t(lang, 'insights.title'),
    '',
    t(lang, 'insights.dataset', { snapshots: m.dataset.snapshots, tickers: m.dataset.tickers }),
  ];
  if (m.dataset.since) lines.push(t(lang, 'insights.since', { since: m.dataset.since.replace('T', ' ').slice(0, 16) }));
  lines.push(t(lang, 'insights.accuracy', {
    rate: pct(m.accuracy.hitRate),
    hits: m.accuracy.hits,
    evaluated: m.accuracy.evaluated,
  }));

  if (m.topGainers.length) {
    lines.push('', t(lang, 'insights.gainers'));
    lines.push(...m.topGainers.map(g => `• ${g.ticker} ${signed(g.trend)}`));
  }
  if (m.topLosers.length) {
    lines.push('', t(lang, 'insights.losers'));
    lines.push(...m.topLosers.map(g => `• ${g.ticker} ${signed(g.trend)}`));
  }
  if (m.mostAlerted.length) {
    lines.push('', t(lang, 'insights.mostAlerted'));
    lines.push(...m.mostAlerted.map(a => `• ${a.ticker}: ${a.count}`));
  }
  lines.push('', t(lang, 'insights.usage'));

  await ctx.replyWithMarkdown(lines.join('\n'));
}

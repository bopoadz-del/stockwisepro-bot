import { Context } from 'telegraf';
import { config } from '../config';
import { getAnalyticsSummary, exportAnalyticsCsv, exportWeightsCsv } from '../db';
import { userSafeError } from '../utils/logger';
import fs from 'fs';
import path from 'path';

function isAdmin(ctx: Context): boolean {
  return ctx.from ? config.adminTelegramIds.includes(String(ctx.from.id)) : false;
}

export async function adminCommand(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.');
    return;
  }

  const summary = getAnalyticsSummary(7);

  const msg = `
📊 *7-Day Analytics Summary*

👥 Total Users: ${summary.totalUsers.count}
📈 Total Events: ${summary.totalEvents.count}

*Top Commands:*
${summary.commandStats.map(c => `• ${c.command}: ${c.count}`).join('\n') || 'None'}

*Top Tickers:*
${summary.topTickers.map(t => `• ${t.ticker}: ${t.count}`).join('\n') || 'None'}
  `.trim();

  await ctx.replyWithMarkdown(msg);
}

export async function adminExportCommand(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.');
    return;
  }

  await ctx.replyWithChatAction('upload_document');
  const csv = exportAnalyticsCsv(30);

  if (!csv) {
    await ctx.reply('No analytics data to export.');
    return;
  }

  const filePath = path.join(config.dataDir, `analytics_export_${Date.now()}.csv`);
  fs.writeFileSync(filePath, csv);

  try {
    await ctx.replyWithDocument({ source: filePath, filename: 'stockwise_analytics.csv' });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function adminExportWeightsCommand(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.');
    return;
  }

  await ctx.replyWithChatAction('upload_document');
  const csv = exportWeightsCsv();

  if (!csv) {
    await ctx.reply('No weights data to export.');
    return;
  }

  const filePath = path.join(config.dataDir, `weights_export_${Date.now()}.csv`);
  fs.writeFileSync(filePath, csv);

  try {
    await ctx.replyWithDocument({ source: filePath, filename: 'stockwise_weights.csv' });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

import { Context } from 'telegraf';
import { config } from '../config';
import {
  getLearningStats,
  getMissedIntents,
  exportMissedIntentsCsv,
  correctChatIntent,
} from '../db';
import { userSafeError } from '../utils/logger';
import fs from 'fs';
import path from 'path';

function isAdmin(ctx: Context): boolean {
  return ctx.from ? config.adminTelegramIds.includes(String(ctx.from.id)) : false;
}

export async function adminLearningCommand(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.');
    return;
  }

  const stats = getLearningStats(7);
  const missed = getMissedIntents(7, 10);
  const fallbackPct = stats.fallbackRate.total > 0
    ? ((stats.fallbackRate.fallbacks / stats.fallbackRate.total) * 100).toFixed(1)
    : '0.0';

  let intentLines = stats.intentStats
    .map(i => `• ${i.detected_intent || 'unknown'}: ${i.count} (${i.fallback_pct}% fallback)`)
    .join('\n');

  let correctionLines = stats.correctionStats
    .map(c => `• ${c.user_corrected_intent}: ${c.count}`)
    .join('\n');

  let missedLines = missed
    .map(m => `• "${m.raw_message}"${m.user_corrected_intent ? ` → ${m.user_corrected_intent}` : ''}`)
    .join('\n');

  const msg = `
📚 *7-Day Learning Stats*

💬 Total chat messages: ${stats.totalChat.count}
❓ Fallback rate: ${fallbackPct}% (${stats.fallbackRate.fallbacks}/${stats.fallbackRate.total})

*Detected intents:*
${intentLines || 'None'}

*User corrections:*
${correctionLines || 'None'}

*Recent missed intents:*
${missedLines || 'None'}
  `.trim();

  await ctx.replyWithMarkdown(msg);
}

export async function adminExportMissedCommand(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.');
    return;
  }

  await ctx.replyWithChatAction('upload_document');
  const csv = exportMissedIntentsCsv(30);

  if (!csv) {
    await ctx.reply('No missed intents to export.');
    return;
  }

  const filePath = path.join(config.dataDir, `missed_intents_${Date.now()}.csv`);
  fs.writeFileSync(filePath, csv);

  try {
    await ctx.replyWithDocument({ source: filePath, filename: 'stockwise_missed_intents.csv' });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function handleCorrectIntentCallback(ctx: Context) {
  if (!('match' in ctx) || !ctx.match) return;
  const match = ctx.match as RegExpExecArray;
  const intent = match[1];
  const logId = parseInt(match[2], 10);

  correctChatIntent(logId, intent);
  await ctx.answerCbQuery(`Logged as: ${intent}`);

  // Optionally run the command for the user if they selected a known intent
  if (intent === 'other') {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return;
  }

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply(`Thanks! I'll learn from that. Try using /${intent === 'watchlist' ? 'watchlist' : intent} next time.`);
}

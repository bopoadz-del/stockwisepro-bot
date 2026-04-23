import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getLearningStats, getMissedIntents } from '../db';

export function startLearningReportService(bot: Telegraf<BotContext>) {
  // Every Saturday at 00:00
  const task = cron.schedule('0 0 * * 6', async () => {
    logger.info('Generating weekly learning report...');

    const stats = getLearningStats(7);
    const missed = getMissedIntents(7, 15);
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
📚 *Weekly Learning Report*
_Week ending ${new Date().toISOString().split('T')[0]}_

💬 Total chat messages: ${stats.totalChat.count}
❓ Fallback rate: ${fallbackPct}% (${stats.fallbackRate.fallbacks}/${stats.fallbackRate.total})

*Detected intents:*
${intentLines || 'None'}

*User corrections:*
${correctionLines || 'None'}

*Top missed intents:*
${missedLines || 'None'}
    `.trim();

    for (const adminId of config.adminTelegramIds) {
      try {
        await bot.telegram.sendMessage(adminId, msg, { parse_mode: 'Markdown' });
        logger.info(`Weekly learning report sent to admin ${adminId}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to send learning report to admin ${adminId}`, { error: errMsg });
      }
    }
  });

  return task;
}

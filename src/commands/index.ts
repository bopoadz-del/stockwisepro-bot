import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { startCommand } from './start';
import { helpCommand } from './help';
import { newsCommand } from './news';
import { searchCommand } from './search';
import { scoreCommand } from './score';
import { watchlistCommand, watchlistAddCommand, watchlistRemoveCommand } from './watchlist';
import { portfolioCommand } from './portfolio';
import { mimicCommand, handleMimicCallback, handleMimicEthicsCallback, handleReplaceSelectCallback, handleReplaceCancelCallback, pendingMimic } from './mimic';
import { experimentCommand, pendingExperiment } from './experiment';
import { handleChatMessage } from './chat';
import { alertCommand } from './alert';
import { adminCommand, adminExportCommand, adminExportWeightsCommand } from './admin';
import { adminLearningCommand, adminExportMissedCommand, handleCorrectIntentCallback } from './learning';
import { weightsCommand, weightsSetCommand, handleWeightCallback } from './weights';
import { simulateCommand } from './simulate';
import { metricsCommand } from './metrics';

export function registerCommands(bot: Telegraf<BotContext>) {
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('news', newsCommand);
  bot.command('search', searchCommand);
  bot.command('score', scoreCommand);
  bot.command('watchlist', watchlistCommand);
  bot.command('watchlist_add', watchlistAddCommand);
  bot.command('watchlist_remove', watchlistRemoveCommand);
  bot.command('portfolio', portfolioCommand);
  bot.command('mimic', mimicCommand);
  bot.command('experiment', experimentCommand);
  bot.command('cancel', async (ctx) => {
    const uid = ctx.from?.id;
    let cancelled = false;
    if (uid && pendingExperiment.has(uid)) {
      pendingExperiment.delete(uid);
      cancelled = true;
    }
    if (uid && pendingMimic.has(uid)) {
      pendingMimic.delete(uid);
      cancelled = true;
    }
    if (cancelled) {
      await ctx.reply('Cancelled.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  });
  bot.command('alert', alertCommand);
  bot.command('alerts', alertCommand); // alias
  bot.command('admin', adminCommand);
  bot.command('admin_export', adminExportCommand);
  bot.command('admin_export_weights', adminExportWeightsCommand);
  bot.command('admin_learning', adminLearningCommand);
  bot.command('admin_export_misses', adminExportMissedCommand);
  bot.command('weights', weightsCommand);
  bot.command('weights_set', weightsSetCommand);
  bot.command('simulate', simulateCommand);
  bot.command('metrics', metricsCommand);

  // Inline callbacks
  bot.action(/^mimic_select:(.+)$/, handleMimicCallback);
  bot.action(/^mimic_ethics:(.+)$/, handleMimicEthicsCallback);
  bot.action(/^replace_select:(\w+):(\w+)$/, handleReplaceSelectCallback);
  bot.action(/^replace_cancel:(\w+)$/, handleReplaceCancelCallback);
  bot.action(/^weight:(.+)$/, handleWeightCallback);

  // Intent correction callbacks (learning)
  bot.action(/^correct_intent:(.+):(\d+)$/, handleCorrectIntentCallback);

  // Feedback callbacks
  bot.action(/^feedback:(.+):(.+)$/, async (ctx) => {
    const match = ctx.match as RegExpExecArray;
    const eventId = parseInt(match[1], 10);
    const rating = parseInt(match[2], 10);
    const telegramId = ctx.from?.id || 0;
    const { saveFeedback, db } = await import('../db');

    // Verify the event belongs to the user submitting feedback
    const eventRow = db.prepare('SELECT telegram_id FROM analytics_events WHERE id = ?').get(eventId) as { telegram_id: number } | undefined;
    if (!eventRow || eventRow.telegram_id !== telegramId) {
      await ctx.answerCbQuery('⛔ Unable to submit feedback.');
      return;
    }

    saveFeedback(telegramId, eventId, rating);
    await ctx.answerCbQuery('Thanks for your feedback!');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  // Chat & natural-language handler
  bot.hears(/.+/, async (ctx) => {
    await handleChatMessage(ctx);
  });
}

import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { startCommand } from './start';
import { helpCommand } from './help';
import { newsCommand } from './news';
import { searchCommand } from './search';
import { scoreCommand } from './score';
import { watchlistCommand, watchlistAddCommand, watchlistRemoveCommand } from './watchlist';
import { portfolioCommand } from './portfolio';
import { mimicCommand, handleMimicCallback } from './mimic';
import { experimentCommand } from './experiment';
import { handleChatMessage } from './chat';
import { alertCommand } from './alert';
import { adminCommand, adminExportCommand, adminExportWeightsCommand } from './admin';
import { weightsCommand, weightsSetCommand, handleWeightCallback } from './weights';

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
  bot.command('alert', alertCommand);
  bot.command('alerts', alertCommand); // alias
  bot.command('admin', adminCommand);
  bot.command('admin_export', adminExportCommand);
  bot.command('admin_export_weights', adminExportWeightsCommand);
  bot.command('weights', weightsCommand);
  bot.command('weights_set', weightsSetCommand);

  // Inline callbacks
  bot.action(/^mimic_select:(.+)$/, handleMimicCallback);
  bot.action(/^weight:(.+)$/, handleWeightCallback);

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

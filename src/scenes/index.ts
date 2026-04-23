import { Scenes, Telegraf } from 'telegraf';
import { BotContext } from '../types';

// If you want complex multi-step flows, define scenes here.
// For now, mimic and experiment use inline callbacks and simple hears.
// Example experiment scene (commented for future use):

/*
const experimentScene = new Scenes.WizardScene<BotContext>(
  'experiment',
  async (ctx) => {
    await ctx.reply('Send me your formula:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    // run experiment with text
    await ctx.reply(`Running: ${text}`);
    return ctx.scene.leave();
  }
);
*/

export function registerScenes(bot: Telegraf<BotContext>) {
  // const stage = new Scenes.Stage<BotContext>([experimentScene]);
  // bot.use(stage.middleware());
}

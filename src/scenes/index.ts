import { Telegraf } from 'telegraf';
import { BotContext } from '../types';

export function registerScenes(_bot: Telegraf<BotContext>) {
  // Scenes are available for future multi-step flows.
  // Currently all complex interactions use inline keyboards and callback handlers.
}

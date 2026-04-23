import { Context, Markup } from 'telegraf';
import { getUserWeights, setUserWeight, resetUserWeights } from '../db';

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'valuation', label: '📊 Valuation' },
  { key: 'profitability', label: '💰 Profitability' },
  { key: 'growth', label: '📈 Growth' },
  { key: 'financial_health', label: '🏥 Financial Health' },
  { key: 'momentum', label: '🚀 Momentum' },
];

const STEP = 5;

export async function weightsCommand(ctx: Context) {
  const telegramId = ctx.from?.id || 0;
  const weights = getUserWeights(telegramId);

  const lines = CATEGORIES.map(c => {
    const val = (weights as any)[c.key];
    return `${c.label}: *${val}*`;
  });

  const msg = `
⚖️ *Your Scoring Weights*

${lines.join('\n')}

_Tap + or – to adjust each factor. Weights are applied when you run /score._
  `.trim();

  const keyboard = CATEGORIES.map(c => [
    Markup.button.callback(`${c.label} –`, `weight:${c.key}:-${STEP}`),
    Markup.button.callback(`${c.label} +`, `weight:${c.key}:+${STEP}`),
  ]);

  keyboard.push([Markup.button.callback('↺ Reset to Defaults', 'weight:reset')]);

  await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(keyboard));
}

export async function weightsSetCommand(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = text.replace('/weights_set', '').trim().split(/\s+/);
  const telegramId = ctx.from?.id || 0;

  if (args.length < 2) {
    await ctx.reply(
      'Usage: /weights_set <category> <value>\n' +
      'Categories: valuation, profitability, growth, financial_health, momentum\n' +
      'Example: /weights_set valuation 80'
    );
    return;
  }

  const [category, valueStr] = args;
  const value = parseInt(valueStr, 10);

  if (isNaN(value) || value < 0 || value > 100) {
    await ctx.reply('Value must be an integer between 0 and 100.');
    return;
  }

  const ok = setUserWeight(telegramId, category.toLowerCase(), value);
  if (!ok) {
    await ctx.reply(
      `❌ Invalid category: ${category}\nValid: valuation, profitability, growth, financial_health, momentum`
    );
    return;
  }

  await ctx.replyWithMarkdown(
    `✅ *${category}* set to *${value}*\n\nRun /weights to see all weights.`
  );
}

export async function handleWeightCallback(ctx: Context) {
  if (!('match' in ctx) || !ctx.match) return;
  const match = ctx.match as RegExpExecArray;
  const action = match[1];

  const telegramId = ctx.from?.id || 0;

  if (action === 'reset') {
    resetUserWeights(telegramId);
    await ctx.answerCbQuery('Weights reset to defaults');
    await weightsCommand(ctx);
    return;
  }

  const [category, direction] = action.split(':');
  if (!category || !direction) {
    await ctx.answerCbQuery('Invalid action');
    return;
  }

  const weights = getUserWeights(telegramId);
  const current = (weights as any)[category] || 0;
  const delta = direction.startsWith('+') ? STEP : -STEP;
  const newValue = current + delta;

  const ok = setUserWeight(telegramId, category, newValue);
  if (!ok) {
    await ctx.answerCbQuery('Invalid category');
    return;
  }

  await ctx.answerCbQuery(`${category} → ${Math.min(Math.max(newValue, 0), 100)}`);
  await weightsCommand(ctx);
}

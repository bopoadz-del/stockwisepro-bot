import { BotContext } from '../types';
import { ensureUser } from '../db';
import { t } from '../i18n';
import { langOf } from '../middleware/i18n';
import { computeTickerInsight, buildTickerContextText } from '../services/insights';
import { isLlmEnabled, llmGenerate } from '../services/llm';

const SYSTEM_EN =
  'You are a concise equity research assistant. Given recorded scoring data for a stock, ' +
  'explain in 3-4 sentences what the data suggests about the score, its reliability, and recent moves. ' +
  'Be factual and do not invent numbers beyond the provided context. This is experimental and not financial advice.';
const SYSTEM_AR =
  'أنت مساعد أبحاث أسهم موجز. استنادًا إلى بيانات التقييم المسجّلة لسهم ما، اشرح في 3-4 جُمل ما تشير إليه ' +
  'البيانات حول التقييم وموثوقيته والتحركات الأخيرة. كن واقعيًا ولا تختلق أرقامًا خارج السياق المقدَّم. ' +
  'هذا تجريبي وليس نصيحة مالية. أجب بالعربية.';

/** /explain <ticker> — Ollama-generated narrative over the recorded data. */
export async function explainCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;
  ensureUser(from.id, from.username, from.first_name, from.last_name);
  const lang = langOf(ctx);

  if (!isLlmEnabled()) {
    await ctx.replyWithMarkdown(t(lang, 'explain.disabled'));
    return;
  }

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const ticker = text.replace(/^\/explain(@\w+)?/, '').trim().split(/\s+/)[0]?.toUpperCase();
  if (!ticker) {
    await ctx.replyWithMarkdown(t(lang, 'explain.usage'));
    return;
  }

  const insight = computeTickerInsight(ticker);
  if (!insight) {
    await ctx.replyWithMarkdown(t(lang, 'explain.noData', { ticker }));
    return;
  }

  await ctx.replyWithChatAction('typing').catch(() => {});

  const context = buildTickerContextText(insight);
  const prompt = `Here is the recorded data for ${ticker}:\n\n${context}\n\nExplain what this suggests.`;
  const summary = await llmGenerate(prompt, lang === 'ar' ? SYSTEM_AR : SYSTEM_EN);

  if (!summary) {
    await ctx.replyWithMarkdown(t(lang, 'explain.failed', { ticker }));
    return;
  }

  await ctx.replyWithMarkdown(
    `${t(lang, 'explain.title', { ticker })}\n\n${summary}\n\n${t(lang, 'explain.disclaimer')}`
  );
}

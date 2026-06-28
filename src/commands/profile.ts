import { BotContext } from '../types';
import { ensureUser, setUserEmail, getUserProfile, upsertWebUserByTelegram } from '../db';
import { t, LANG_NAMES } from '../i18n';
import { langOf } from '../middleware/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * /profile            → show your profile (email, language, alert status)
 * /profile a@b.com    → set your email (no confirmation, no password)
 */
export async function profileCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);
  const lang = langOf(ctx);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const arg = text.replace(/^\/profile(@\w+)?/, '').trim();

  if (arg) {
    if (!EMAIL_RE.test(arg)) {
      await ctx.replyWithMarkdown(t(lang, 'profile.invalidEmail'));
      return;
    }
    setUserEmail(from.id, arg);
    // Keep the linked web profile in sync so the website shows the same email.
    const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;
    upsertWebUserByTelegram(from.id, arg, displayName);
    await ctx.replyWithMarkdown(t(lang, 'profile.saved', { email: arg.toLowerCase() }));
    return;
  }

  const profile = getUserProfile(from.id);
  const lines = [
    t(lang, 'profile.title'),
    '',
    profile?.email ? t(lang, 'profile.email', { email: profile.email }) : t(lang, 'profile.emailNone'),
    t(lang, 'profile.language', { language: LANG_NAMES[lang] }),
    t(lang, 'profile.alerts', {
      status: profile?.market_alerts_optin ? t(lang, 'profile.alertsOn') : t(lang, 'profile.alertsOff'),
    }),
    '',
    t(lang, 'profile.hint'),
  ];

  await ctx.replyWithMarkdown(lines.join('\n'));
}

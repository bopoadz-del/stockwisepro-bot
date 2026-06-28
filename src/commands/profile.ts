import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { ensureUser, setUserEmail, getUserProfile, upsertWebUserByTelegram } from '../db';
import { t, LANG_NAMES } from '../i18n';
import { langOf } from '../middleware/i18n';
import { config } from '../config';
import { signTelegramLinkToken } from '../web/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * /profile            → show your profile (email, language, alert status) + a
 *                        one-tap website link that signs you into the same profile
 * /profile a@b.com    → set your email (no confirmation, no password)
 */
export async function profileCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);
  const lang = langOf(ctx);
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const arg = text.replace(/^\/profile(@\w+)?/, '').trim();

  if (arg) {
    if (!EMAIL_RE.test(arg)) {
      await ctx.replyWithMarkdown(t(lang, 'profile.invalidEmail'));
      return;
    }
    setUserEmail(from.id, arg);
    // Keep the linked web profile in sync so the website shows the same email.
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

  // One-tap link that opens the website already signed into this profile.
  if (config.websiteUrl) {
    const token = signTelegramLinkToken({ tid: from.id, email: profile?.email ?? null, name: displayName });
    const sep = config.websiteUrl.includes('?') ? '&' : '?';
    const url = `${config.websiteUrl}${sep}tg=${token}`;
    await ctx.replyWithMarkdown(lines.join('\n'), Markup.inlineKeyboard([
      [Markup.button.url(t(lang, 'start.website'), url)],
    ]));
    return;
  }

  await ctx.replyWithMarkdown(lines.join('\n'));
}

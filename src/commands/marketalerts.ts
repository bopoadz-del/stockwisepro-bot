import { BotContext } from '../types';
import { ensureUser, getMarketAlertOptIn, setMarketAlertOptIn } from '../db';
import { t } from '../i18n';
import { langOf } from '../middleware/i18n';

/** /marketalerts — toggle subscription to big market-move push alerts. */
export async function marketAlertsCommand(ctx: BotContext) {
  const from = ctx.from;
  if (!from) return;

  ensureUser(from.id, from.username, from.first_name, from.last_name);

  const next = !getMarketAlertOptIn(from.id);
  setMarketAlertOptIn(from.id, next);

  await ctx.replyWithMarkdown(t(langOf(ctx), next ? 'marketalerts.enabled' : 'marketalerts.disabled'));
}

/**
 * Lightweight i18n layer for the Telegram bot.
 *
 * Supports English ('en') and Arabic ('ar'). Each translation is keyed by a
 * dotted string; values may contain `{var}` placeholders interpolated by t().
 */

export type Lang = 'en' | 'ar';

export const SUPPORTED_LANGS: Lang[] = ['en', 'ar'];
export const DEFAULT_LANG: Lang = 'en';

export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ar: 'العربية',
};

type Dict = Record<string, string>;

const en: Dict = {
  // start
  'start.welcome':
    '🚀 *Welcome to StockWiseBot!*\n\n' +
    'Your AI-powered stock research companion.\n\n' +
    '*Quick commands:*\n' +
    '🔍 /search <ticker> — Lookup a stock\n' +
    '📊 /score <ticker> — Get AI scoring\n' +
    '🎲 /simulate <ticker> <days> — Monte Carlo forecast\n' +
    '📐 /metrics <ticker> — Risk stats\n' +
    '⭐ /watchlist — Manage watchlist\n' +
    '💼 /portfolio — View portfolio\n' +
    '🧠 /mimic — Copy legendary investors\n' +
    '🧪 /experiment — Test scoring formulas\n' +
    '🔔 /alert — Price alerts\n' +
    '🌐 /language — Change language\n' +
    '📈 /help — Full command list\n\n' +
    '_Built for experimental research. Data is logged to improve scoring accuracy._',

  // help
  'help.title': '📖 *StockWiseBot Commands*',
  'help.section.research': '*Research*',
  'help.research.search': '/search <ticker> — Search stocks',
  'help.research.score': '/score <ticker> — AI scoring & metrics',
  'help.research.simulate': '/simulate <ticker> <days> — Monte Carlo price simulation',
  'help.research.metrics': '/metrics <ticker> — Risk stats (vol, Sharpe, VaR, drawdown)',
  'help.section.portfolio': '*Portfolio*',
  'help.portfolio.watchlist': '/watchlist — View watchlist',
  'help.portfolio.watchlist_add': '/watchlist_add <ticker> — Add stock',
  'help.portfolio.watchlist_remove': '/watchlist_remove <ticker> — Remove stock',
  'help.portfolio.portfolio': '/portfolio — View your portfolio',
  'help.portfolio.mimic': '/mimic — Copy investor strategy',
  'help.portfolio.screenshot': '📸 Send a screenshot — Bot parses tickers & scores them',
  'help.section.tools': '*Tools*',
  'help.tools.experiment': '/experiment — Test custom formulas',
  'help.tools.alert': '/alert — Set price alerts',
  'help.tools.alerts': '/alerts — View your alerts',
  'help.tools.marketalerts': '/marketalerts — Toggle big market-move alerts',
  'help.tools.insights': '/insights — Market insights & signal accuracy',
  'help.tools.explain': '/explain <ticker> — AI explanation (when configured)',
  'help.section.admin': '*Admin*',
  'help.admin.admin': '/admin — Usage stats',
  'help.admin.export': '/admin_export — Download CSV analytics',
  'help.section.general': '*General*',
  'help.general.start': '/start — Welcome message',
  'help.general.profile': '/profile — View or set your profile (email)',
  'help.general.language': '/language — Change language',
  'help.general.help': '/help — This menu',

  // language
  'language.prompt': '🌐 *Choose your language*\n\nالسلام عليكم — choose a language below.',
  'language.changed': '✅ Language set to *English*.',
  'language.current': 'Current language: *English*',

  // website
  'start.website': '🌐 Visit Website',

  // market alerts
  'marketalerts.enabled': "🔔 Market alerts *enabled*. You'll be notified of big market moves. Send /marketalerts again to turn off.",
  'marketalerts.disabled': '🔕 Market alerts *disabled*. Send /marketalerts to turn them back on.',
  'marketalert.big': '📊 *Big Market Move*',
  'marketalert.extreme': '🚨 *Extreme Market Move*',
  'marketalert.score': 'Score',

  // profile
  'profile.title': '👤 *Your Profile*',
  'profile.email': '📧 Email: {email}',
  'profile.emailNone': '📧 Email: _not set_',
  'profile.language': '🌐 Language: {language}',
  'profile.alerts': '🔔 Market alerts: {status}',
  'profile.alertsOn': 'on',
  'profile.alertsOff': 'off',
  'profile.hint': '_To set your email: /profile your@email.com_',
  'profile.saved': '✅ Email saved: {email}',
  'profile.invalidEmail': '⚠️ That doesn\'t look like a valid email. Try: /profile your@email.com',

  // insights (Phase 4)
  'insights.title': '🧠 *Market Insights*',
  'insights.dataset': '📦 Dataset: {snapshots} snapshots · {tickers} tickers',
  'insights.since': '🕒 Recording since: {since}',
  'insights.accuracy': '🎯 Score signal hit-rate: {rate} ({hits}/{evaluated})',
  'insights.notEnough': '📭 Not enough data yet. The live feed records one ticker per minute — check back soon.',
  'insights.gainers': '📈 *Top score gainers*',
  'insights.losers': '📉 *Top score drops*',
  'insights.mostAlerted': '🚨 *Most alerted*',
  'insights.tickerTitle': '🧠 *{ticker} — Insights*',
  'insights.samples': '🔢 Samples: {samples}',
  'insights.latest': '📊 Latest score: {score} ({signal}) @ {price}',
  'insights.scoreRange': '📐 Score range: {min}–{max} (avg {avg})',
  'insights.trend': '↕️ Score trend: {trend}',
  'insights.recentAlerts': '🚨 Recent alerts:',
  'insights.noTicker': '📭 No data recorded for {ticker} yet.',
  'insights.usage': '_Usage: /insights — or /insights AAPL for one ticker_',

  // explain (AI narrative via Ollama)
  'explain.usage': '_Usage: /explain AAPL_',
  'explain.disabled': '🤖 AI explanations aren\'t configured yet (set OLLAMA_URL). Try /insights for the data.',
  'explain.noData': '📭 No data recorded for {ticker} yet.',
  'explain.thinking': '🤖 Analyzing {ticker}…',
  'explain.failed': '🤖 Couldn\'t generate an explanation right now. Try /insights {ticker}.',
  'explain.title': '🤖 *{ticker} — AI take*',
  'explain.disclaimer': '_Experimental, not financial advice._',

  // common
  'common.error': '❌ Something went wrong. Please try again later.',
  'common.cancelled': 'Cancelled.',
  'common.nothingToCancel': 'Nothing to cancel.',
  'common.ping': '🏓 Pong! Bot is alive.',
  'common.feedbackThanks': 'Thanks for your feedback!',
  'common.feedbackError': '⛔ Unable to submit feedback.',
};

const ar: Dict = {
  // start
  'start.welcome':
    '🚀 *مرحبًا بك في StockWiseBot!*\n\n' +
    'رفيقك الذكي لأبحاث الأسهم المدعوم بالذكاء الاصطناعي.\n\n' +
    '*أوامر سريعة:*\n' +
    '🔍 /search <الرمز> — البحث عن سهم\n' +
    '📊 /score <الرمز> — الحصول على تقييم ذكي\n' +
    '🎲 /simulate <الرمز> <الأيام> — توقع مونت كارلو\n' +
    '📐 /metrics <الرمز> — إحصاءات المخاطر\n' +
    '⭐ /watchlist — إدارة قائمة المتابعة\n' +
    '💼 /portfolio — عرض المحفظة\n' +
    '🧠 /mimic — محاكاة كبار المستثمرين\n' +
    '🧪 /experiment — اختبار صيغ التقييم\n' +
    '🔔 /alert — تنبيهات الأسعار\n' +
    '🌐 /language — تغيير اللغة\n' +
    '📈 /help — قائمة الأوامر الكاملة\n\n' +
    '_صُمم لأغراض بحثية تجريبية. يتم تسجيل البيانات لتحسين دقة التقييم._',

  // help
  'help.title': '📖 *أوامر StockWiseBot*',
  'help.section.research': '*الأبحاث*',
  'help.research.search': '/search <الرمز> — البحث عن الأسهم',
  'help.research.score': '/score <الرمز> — التقييم الذكي والمقاييس',
  'help.research.simulate': '/simulate <الرمز> <الأيام> — محاكاة أسعار مونت كارلو',
  'help.research.metrics': '/metrics <الرمز> — إحصاءات المخاطر (التقلب، شارب، القيمة المعرضة للخطر)',
  'help.section.portfolio': '*المحفظة*',
  'help.portfolio.watchlist': '/watchlist — عرض قائمة المتابعة',
  'help.portfolio.watchlist_add': '/watchlist_add <الرمز> — إضافة سهم',
  'help.portfolio.watchlist_remove': '/watchlist_remove <الرمز> — إزالة سهم',
  'help.portfolio.portfolio': '/portfolio — عرض محفظتك',
  'help.portfolio.mimic': '/mimic — محاكاة استراتيجية مستثمر',
  'help.portfolio.screenshot': '📸 أرسل لقطة شاشة — يحلل البوت الرموز ويقيّمها',
  'help.section.tools': '*الأدوات*',
  'help.tools.experiment': '/experiment — اختبار صيغ مخصصة',
  'help.tools.alert': '/alert — ضبط تنبيهات الأسعار',
  'help.tools.alerts': '/alerts — عرض تنبيهاتك',
  'help.tools.marketalerts': '/marketalerts — تفعيل/إيقاف تنبيهات تحركات السوق الكبيرة',
  'help.tools.insights': '/insights — رؤى السوق ودقة الإشارة',
  'help.tools.explain': '/explain <الرمز> — تفسير بالذكاء الاصطناعي (عند الإعداد)',
  'help.section.admin': '*الإدارة*',
  'help.admin.admin': '/admin — إحصاءات الاستخدام',
  'help.admin.export': '/admin_export — تنزيل تحليلات CSV',
  'help.section.general': '*عام*',
  'help.general.start': '/start — رسالة الترحيب',
  'help.general.profile': '/profile — عرض أو تعيين ملفك الشخصي (البريد الإلكتروني)',
  'help.general.language': '/language — تغيير اللغة',
  'help.general.help': '/help — هذه القائمة',

  // language
  'language.prompt': '🌐 *اختر لغتك*\n\nاختر لغة من الأسفل.',
  'language.changed': '✅ تم ضبط اللغة على *العربية*.',
  'language.current': 'اللغة الحالية: *العربية*',

  // website
  'start.website': '🌐 زيارة الموقع',

  // market alerts
  'marketalerts.enabled': '🔔 تم *تفعيل* تنبيهات السوق. سيتم إعلامك بالتحركات الكبيرة في السوق. أرسل /marketalerts مرة أخرى لإيقافها.',
  'marketalerts.disabled': '🔕 تم *إيقاف* تنبيهات السوق. أرسل /marketalerts لإعادة تفعيلها.',
  'marketalert.big': '📊 *تحرك كبير في السوق*',
  'marketalert.extreme': '🚨 *تحرك حاد في السوق*',
  'marketalert.score': 'الدرجة',

  // profile
  'profile.title': '👤 *ملفك الشخصي*',
  'profile.email': '📧 البريد الإلكتروني: {email}',
  'profile.emailNone': '📧 البريد الإلكتروني: _غير محدد_',
  'profile.language': '🌐 اللغة: {language}',
  'profile.alerts': '🔔 تنبيهات السوق: {status}',
  'profile.alertsOn': 'مفعّلة',
  'profile.alertsOff': 'متوقفة',
  'profile.hint': '_لتعيين بريدك الإلكتروني: /profile your@email.com_',
  'profile.saved': '✅ تم حفظ البريد الإلكتروني: {email}',
  'profile.invalidEmail': '⚠️ لا يبدو هذا بريدًا إلكترونيًا صالحًا. جرّب: /profile your@email.com',

  // insights (Phase 4)
  'insights.title': '🧠 *رؤى السوق*',
  'insights.dataset': '📦 البيانات: {snapshots} لقطة · {tickers} رمزًا',
  'insights.since': '🕒 التسجيل منذ: {since}',
  'insights.accuracy': '🎯 دقة إشارة التقييم: {rate} ({hits}/{evaluated})',
  'insights.notEnough': '📭 لا توجد بيانات كافية بعد. تسجّل التغذية المباشرة رمزًا واحدًا كل دقيقة — تحقق لاحقًا.',
  'insights.gainers': '📈 *أكبر ارتفاعات التقييم*',
  'insights.losers': '📉 *أكبر انخفاضات التقييم*',
  'insights.mostAlerted': '🚨 *الأكثر تنبيهًا*',
  'insights.tickerTitle': '🧠 *{ticker} — رؤى*',
  'insights.samples': '🔢 العينات: {samples}',
  'insights.latest': '📊 آخر تقييم: {score} ({signal}) عند {price}',
  'insights.scoreRange': '📐 نطاق التقييم: {min}–{max} (المتوسط {avg})',
  'insights.trend': '↕️ اتجاه التقييم: {trend}',
  'insights.recentAlerts': '🚨 تنبيهات حديثة:',
  'insights.noTicker': '📭 لا توجد بيانات مسجّلة لـ {ticker} بعد.',
  'insights.usage': '_الاستخدام: /insights — أو /insights AAPL لرمز واحد_',

  // explain (AI narrative via Ollama)
  'explain.usage': '_الاستخدام: /explain AAPL_',
  'explain.disabled': '🤖 لم تُضبط تفسيرات الذكاء الاصطناعي بعد (عيّن OLLAMA_URL). جرّب /insights للبيانات.',
  'explain.noData': '📭 لا توجد بيانات مسجّلة لـ {ticker} بعد.',
  'explain.thinking': '🤖 يجري تحليل {ticker}…',
  'explain.failed': '🤖 تعذّر إنشاء تفسير الآن. جرّب /insights {ticker}.',
  'explain.title': '🤖 *{ticker} — رأي الذكاء الاصطناعي*',
  'explain.disclaimer': '_تجريبي، وليس نصيحة مالية._',

  // common
  'common.error': '❌ حدث خطأ ما. يرجى المحاولة لاحقًا.',
  'common.cancelled': 'تم الإلغاء.',
  'common.nothingToCancel': 'لا يوجد شيء لإلغائه.',
  'common.ping': '🏓 بونغ! البوت يعمل.',
  'common.feedbackThanks': 'شكرًا على ملاحظاتك!',
  'common.feedbackError': '⛔ تعذّر إرسال الملاحظات.',
};

const DICTS: Record<Lang, Dict> = { en, ar };

export function normalizeLang(value: unknown): Lang {
  return value === 'ar' ? 'ar' : 'en';
}

/**
 * Translate a key for the given language, interpolating `{var}` placeholders.
 * Falls back to English, then to the raw key if no translation is found.
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[lang] || DICTS[DEFAULT_LANG];
  let template = dict[key] ?? DICTS[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), String(val));
    }
  }
  return template;
}

export const HELP_LINES: Record<Lang, string> = {
  en: buildHelp('en'),
  ar: buildHelp('ar'),
};

function buildHelp(lang: Lang): string {
  const k = (key: string) => t(lang, key);
  return [
    k('help.title'),
    '',
    k('help.section.research'),
    k('help.research.search'),
    k('help.research.score'),
    k('help.research.simulate'),
    k('help.research.metrics'),
    '',
    k('help.section.portfolio'),
    k('help.portfolio.watchlist'),
    k('help.portfolio.watchlist_add'),
    k('help.portfolio.watchlist_remove'),
    k('help.portfolio.portfolio'),
    k('help.portfolio.mimic'),
    k('help.portfolio.screenshot'),
    '',
    k('help.section.tools'),
    k('help.tools.experiment'),
    k('help.tools.alert'),
    k('help.tools.alerts'),
    k('help.tools.marketalerts'),
    k('help.tools.insights'),
    k('help.tools.explain'),
    '',
    k('help.section.admin'),
    k('help.admin.admin'),
    k('help.admin.export'),
    '',
    k('help.section.general'),
    k('help.general.start'),
    k('help.general.profile'),
    k('help.general.language'),
    k('help.general.help'),
  ].join('\n');
}

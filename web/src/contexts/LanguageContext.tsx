import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, type Lang } from '@/i18n/translations';

interface LanguageContextValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'stockwise.lang';

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored as Lang)) return stored as Lang;
  const browser = window.navigator.language?.toLowerCase() ?? '';
  if (browser.startsWith('ar')) return 'ar';
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    if (SUPPORTED_LANGS.includes(next)) setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
      let template = dict[key] ?? TRANSLATIONS[DEFAULT_LANG][key] ?? key;
      if (vars) {
        for (const [name, val] of Object.entries(vars)) {
          template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), String(val));
        }
      }
      return template;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, dir, setLang, toggleLang, t }), [lang, dir, setLang, toggleLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useTranslation() {
  const { t, lang, dir } = useLanguage();
  return { t, lang, dir };
}

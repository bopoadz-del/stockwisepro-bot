import { Languages } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  className?: string;
}

/**
 * Compact EN / العربية switcher. Clicking toggles between English and Arabic
 * (which also flips the document direction to RTL via LanguageProvider).
 */
export function LanguageToggle({ className }: LanguageToggleProps) {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
        'bg-white/5 text-white/70 hover:bg-gold/20 hover:text-gold transition-colors',
        className
      )}
    >
      <Languages size={16} />
      <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}

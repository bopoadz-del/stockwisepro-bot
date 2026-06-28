import type { SignalType } from '@/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTranslation } from '@/contexts/LanguageContext';

interface SignalBadgeProps {
  signal: SignalType;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function SignalBadge({ signal, size = 'md', showIcon = true }: SignalBadgeProps) {
  const { t } = useTranslation();
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  const config = {
    buy: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      text: 'text-green-500',
      icon: TrendingUp,
      label: t('signal.buy'),
    },
    hold: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-500',
      icon: Minus,
      label: t('signal.hold'),
    },
    sell: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-500',
      icon: TrendingDown,
      label: t('signal.sell'),
    },
  };

  const { bg, border, text, icon: Icon, label } = config[signal];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${bg} ${border} ${text} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon size={iconSizes[size]} />}
      {label}
    </span>
  );
}

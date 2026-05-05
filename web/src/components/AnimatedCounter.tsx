import { useCountUp } from '@/hooks/useCountUp';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedCounter({
  end,
  duration = 2000,
  prefix = '',
  suffix = '',
  separator = ',',
  decimals = 0,
  className = '',
}: AnimatedCounterProps) {
  const { formattedValue } = useCountUp({
    end,
    duration,
    prefix,
    suffix,
    separator,
    decimals,
  });

  return <span className={className}>{formattedValue}</span>;
}

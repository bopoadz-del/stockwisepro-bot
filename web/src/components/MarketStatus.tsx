import { getMarketStatus } from '@/lib/utils';
import { Clock } from 'lucide-react';

export function MarketStatus() {
  const { open, message } = getMarketStatus();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
      <div
        className={`w-2 h-2 rounded-full ${
          open ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <Clock size={14} className="text-white/60" />
      <span className="text-sm text-white/80">{message}</span>
    </div>
  );
}

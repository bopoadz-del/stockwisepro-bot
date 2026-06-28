import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from '@/contexts/LanguageContext';
import type { LiveAlert } from '@/lib/api/live';

// Color the bubble by event: extreme moves are "major" (gold), otherwise
// green for a rise and red for a dip.
function alertStyle(alert: LiveAlert): string {
  if (alert.severity === 'extreme') return 'bg-gold/10 border-gold/40 text-gold';
  return alert.direction === 'down'
    ? 'bg-red-500/10 border-red-500/40 text-red-400'
    : 'bg-green-500/10 border-green-500/40 text-green-400';
}

/**
 * Floating "live bubble" that surfaces the latest big market move. Same footprint
 * as the original live-data card, but its color/pulse change with the event.
 */
export function LiveAlertBubble({ alert }: { alert: LiveAlert | null }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 1 }}
      className="absolute -right-4 bottom-1/4 w-60"
    >
      <AnimatePresence mode="wait">
        {alert ? (
          <motion.div
            key={`${alert.ticker}-${alert.createdAt}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl border p-4 shadow-card backdrop-blur ${alertStyle(alert)}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {alert.direction === 'down' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              <span className="font-bold">{alert.ticker}</span>
              <span className="font-mono text-sm">
                {alert.changePct >= 0 ? '+' : ''}
                {alert.changePct.toFixed(2)}%
              </span>
              <span className="ms-auto w-2 h-2 rounded-full bg-current animate-pulse" />
            </div>
            <p className="text-xs opacity-80">{t('alert.severity.' + alert.severity)}</p>
            {alert.headline && (
              <p className="text-white/70 text-xs mt-1">
                {alert.headline.length > 90 ? `${alert.headline.slice(0, 90)}…` : alert.headline}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="calm"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4 shadow-card"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white/70 text-sm">{t('live.calm')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

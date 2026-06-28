import { motion } from 'framer-motion';
import { useTranslation } from '@/contexts/LanguageContext';
import type { LiveSnapshot } from '@/lib/api/live';

function scoreGradient(score: number | null): string {
  if (score == null) return 'from-white/20 to-white/10';
  if (score >= 70) return 'from-green-500 to-emerald-400';
  if (score >= 45) return 'from-amber-500 to-yellow-400';
  return 'from-red-500 to-rose-400';
}

function barColor(value: number): string {
  if (value >= 70) return 'bg-green-500';
  if (value >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

function signalStyle(signal: 'buy' | 'hold' | 'sell'): string {
  if (signal === 'buy') return 'bg-green-500/10 border-green-500/30 text-green-500';
  if (signal === 'sell') return 'bg-red-500/10 border-red-500/30 text-red-500';
  return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
}

/**
 * Live, rotating stock-score card. The backend cycles to a new S&P 500 ticker
 * roughly every minute; this card reflects the latest snapshot, colored by band.
 */
export function LiveScoreCard({ snapshot }: { snapshot: LiveSnapshot | null }) {
  const { t } = useTranslation();
  const score = snapshot?.score ?? null;
  const pillars = snapshot?.pillars ?? null;
  const change = snapshot?.changePct ?? null;

  return (
    <div className="bg-[#1f1f1f] rounded-2xl border border-white/10 p-6 shadow-card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-white font-semibold text-lg">{t('hero.card.title')}</h3>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-500 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {t('live.badge')}
            </span>
          </div>
          <p className="text-white/50 text-sm">
            {snapshot ? `${snapshot.ticker}${snapshot.name ? ` · ${snapshot.name}` : ''}` : t('live.loading')}
          </p>
        </div>
        <motion.div
          key={snapshot?.ticker ?? 'none'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className={`w-16 h-16 rounded-full bg-gradient-to-br ${scoreGradient(score)} flex items-center justify-center`}
        >
          <span className="text-2xl font-bold text-white">{score != null ? Math.round(score) : '—'}</span>
        </motion.div>
      </div>

      {/* Pillar breakdown */}
      <div className="space-y-4">
        {pillars
          ? Object.entries(pillars).map(([key, raw], index) => {
              const value = Math.max(0, Math.min(100, Math.round(raw)));
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">{t('pillar.' + key)}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      key={`${snapshot?.ticker}-${key}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.8, delay: index * 0.05 }}
                      className={`h-full ${barColor(value)} rounded-full`}
                    />
                  </div>
                </div>
              );
            })
          : Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-2 bg-white/5 rounded-full animate-pulse" />
            ))}
      </div>

      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-white/70">{t('hero.card.signal')}</span>
          <div className="flex items-center gap-3">
            {change != null && (
              <span className={`text-sm font-mono ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            )}
            {snapshot?.signal && (
              <span className={`px-3 py-1 rounded-full border font-semibold text-sm ${signalStyle(snapshot.signal)}`}>
                {t('signal.' + snapshot.signal)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

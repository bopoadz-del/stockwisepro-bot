import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Users, TrendingUp, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { DemoModal } from '@/components/DemoModal';
import { useTranslation } from '@/contexts/LanguageContext';
import { useLiveFeed } from '@/hooks/useLiveFeed';
import { LiveScoreCard } from '@/components/LiveScoreCard';
import { LiveAlertBubble } from '@/components/LiveAlertBubble';

const stats = [
  { icon: Users, value: 50000, suffix: '+', label: 'hero.stat.investors' },
  { icon: TrendingUp, value: 2, prefix: '$', suffix: 'B+', label: 'hero.stat.assets' },
  { icon: Target, value: 94, suffix: '%', label: 'hero.stat.accuracy' },
];

interface HeroProps {
  onCtaClick?: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const { t } = useTranslation();
  const { snapshot, alerts } = useLiveFeed();
  return (
    <section className="relative min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#141414] pt-[120px] pb-20 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gold/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Content */}
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/10 border border-gold/30 text-gold text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                {t('hero.badge')}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight"
            >
              {t('hero.title')}{' '}
              <span className="text-gradient-gold">{t('hero.titleHighlight')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-lg text-white/70 max-w-xl leading-relaxed"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex flex-wrap gap-4"
            >
              <Button
                size="lg"
                onClick={onCtaClick}
                className="bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold px-8 h-14 text-base group"
              >
                {t('hero.startFreeTrial')}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setIsDemoOpen(true)}
                className="border-white/20 text-white hover:bg-white/10 px-8 h-14 text-base"
              >
                <Play className="mr-2 w-5 h-5" />
                {t('hero.viewDemo')}
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10"
            >
              {stats.map((stat, index) => (
                <div key={index} className="text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-gold mb-1">
                    <stat.icon size={20} />
                    <span className="text-2xl sm:text-3xl font-bold">
                      <AnimatedCounter
                        end={stat.value}
                        prefix={stat.prefix}
                        suffix={stat.suffix}
                        duration={2000}
                      />
                    </span>
                  </div>
                  <p className="text-sm text-white/50">{t(stat.label)}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative hidden lg:block"
          >
            <div className="relative">
              {/* Live, rotating score card */}
              <LiveScoreCard snapshot={snapshot} />

              {/* Floating live market-alert bubble */}
              <LiveAlertBubble alert={alerts[0] ?? null} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Demo Modal */}
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </section>
  );
}

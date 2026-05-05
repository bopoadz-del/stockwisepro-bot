import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Users, TrendingUp, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { DemoModal } from '@/components/DemoModal';

const stats = [
  { icon: Users, value: 50000, suffix: '+', label: 'Active Investors' },
  { icon: TrendingUp, value: 2, prefix: '$', suffix: 'B+', label: 'Assets Analyzed' },
  { icon: Target, value: 94, suffix: '%', label: 'Accuracy Rate' },
];

interface HeroProps {
  onCtaClick?: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
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
                Now with real-time data
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight"
            >
              AI-Powered Stock Analysis for{' '}
              <span className="text-gradient-gold">Smarter Investing</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-lg text-white/70 max-w-xl leading-relaxed"
            >
              Get professional-grade stock scores, mimic legendary investor portfolios, and make
              data-driven decisions with our transparent scoring system.
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
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setIsDemoOpen(true)}
                className="border-white/20 text-white hover:bg-white/10 px-8 h-14 text-base"
              >
                <Play className="mr-2 w-5 h-5" />
                View Demo
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
                  <p className="text-sm text-white/50">{stat.label}</p>
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
              {/* Main Card */}
              <div className="bg-[#1f1f1f] rounded-2xl border border-white/10 p-6 shadow-card">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-white font-semibold text-lg">Stock Score Analysis</h3>
                    <p className="text-white/50 text-sm">AAPL - Apple Inc.</p>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">78</span>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-4">
                  {[
                    { label: 'Valuation', score: 75, color: 'bg-green-500' },
                    { label: 'Profitability', score: 85, color: 'bg-green-500' },
                    { label: 'Growth', score: 70, color: 'bg-amber-500' },
                    { label: 'Financial Health', score: 80, color: 'bg-green-500' },
                    { label: 'Momentum', score: 65, color: 'bg-amber-500' },
                  ].map((item, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/70">{item.label}</span>
                        <span className="text-white font-medium">{item.score}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.score}%` }}
                          transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                          className={`h-full ${item.color} rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Signal</span>
                    <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-500 font-semibold text-sm">
                      BUY
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="absolute -left-8 top-1/4 bg-[#1f1f1f] rounded-xl border border-white/10 p-4 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <span className="text-purple-400 font-bold">B</span>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Buffett Portfolio</p>
                    <p className="text-green-500 text-xs">+12.4% YTD</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1 }}
                className="absolute -right-4 bottom-1/4 bg-[#1f1f1f] rounded-xl border border-white/10 p-4 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-white/70 text-sm">Live Market Data</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Demo Modal */}
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </section>
  );
}

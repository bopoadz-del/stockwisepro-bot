import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { marketIndices } from '@/lib/data';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { ScrollReveal } from '@/components/ScrollReveal';
import { MarketStatus } from '@/components/MarketStatus';
import { SparklineChart } from '@/components/SparklineChart';

export function LiveMarketData() {
  return (
    <section className="py-16 bg-[#141414]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Market Overview</h2>
              <p className="text-white/60">Real-time market indices and trending stocks</p>
            </div>
            <div className="flex items-center gap-4">
              <MarketStatus />
              <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <RefreshCw size={18} className="text-white/60" />
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Market Indices Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {marketIndices.map((index, i) => (
            <ScrollReveal key={index.symbol} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                className="bg-[#1f1f1f] rounded-xl border border-white/10 p-5 hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/60 text-sm">{index.name}</span>
                  {index.change >= 0 ? (
                    <TrendingUp size={16} className="text-green-500" />
                  ) : (
                    <TrendingDown size={16} className="text-red-500" />
                  )}
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatCurrency(index.price)}
                </div>
                <div
                  className={`flex items-center gap-1 text-sm font-medium ${
                    index.change >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  <span>{index.change >= 0 ? '+' : ''}{index.change.toFixed(2)}</span>
                  <span>({formatPercentage(index.changePercent)})</span>
                </div>
                {/* Mini Sparkline */}
                <div className="mt-3 h-10">
                  <SparklineChart
                    data={Array.from({ length: 10 }, () =>
                      index.price + (Math.random() - 0.5) * index.price * 0.02
                    )}
                    isPositive={index.change >= 0}
                    height={40}
                  />
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        {/* Trending Stocks Banner */}
        <ScrollReveal delay={0.4}>
          <div className="bg-gradient-to-r from-gold/10 via-gold/5 to-transparent rounded-xl border border-gold/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
              <span className="text-gold font-medium text-sm">Trending Now</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {['NVDA +1.79%', 'META +1.58%', 'AMZN +1.78%', 'TSLA -3.40%', 'MSFT +1.28%'].map(
                (item, index) => {
                  const isPositive = !item.includes('-');
                  return (
                    <span
                      key={index}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                        isPositive
                          ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                          : 'bg-red-500/10 text-red-500 border border-red-500/30'
                      }`}
                    >
                      {item}
                    </span>
                  );
                }
              )}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

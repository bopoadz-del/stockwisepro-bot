import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Search, Trash2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { stocksApi, type StockQuote, type KeyMetrics } from '@/lib/api/stocks';
import { formatCurrency, formatPercentage, getScoreColor } from '@/lib/utils';
import { ScoreVisualizer } from './ScoreVisualizer';
import { SignalBadge } from './SignalBadge';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface ComparisonStock {
  ticker: string;
  quote: StockQuote | null;
  metrics: KeyMetrics | null;
  score: number;
  loading: boolean;
}

interface StockComparisonProps {
  isOpen: boolean;
  onClose: () => void;
}

// Calculate score from quote and metrics
function calculateScore(quote: StockQuote | null, metrics: KeyMetrics | null): number {
  if (!quote) return 50;
  
  let score = 50; // Base score
  
  // Factor in P/E ratio
  if (metrics?.peRatio && metrics.peRatio > 0) {
    if (metrics.peRatio < 15) score += 15;
    else if (metrics.peRatio < 25) score += 10;
    else if (metrics.peRatio < 40) score += 5;
    else score -= 5;
  }
  
  // Factor in price momentum
  if (quote.changesPercentage > 5) score += 10;
  else if (quote.changesPercentage > 0) score += 5;
  else if (quote.changesPercentage < -5) score -= 10;
  else if (quote.changesPercentage < 0) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

export function StockComparison({ isOpen, onClose }: StockComparisonProps) {
  const [stocks, setStocks] = useState<ComparisonStock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addStock = async (ticker: string) => {
    if (stocks.length >= 4) return;
    if (stocks.some((s) => s.ticker === ticker.toUpperCase())) return;

    const newStock: ComparisonStock = {
      ticker: ticker.toUpperCase(),
      quote: null,
      metrics: null,
      score: 0,
      loading: true,
    };

    setStocks([...stocks, newStock]);
    setSearchQuery('');
    setIsAdding(false);

    try {
      const [quoteResponse, metricsResponse] = await Promise.all([
        stocksApi.getQuote(ticker),
        stocksApi.getKeyMetrics(ticker),
      ]);

      const quote = quoteResponse.data || null;
      const metrics = metricsResponse.data || null;
      const score = calculateScore(quote, metrics);

      setStocks((prev) =>
        prev.map((s) =>
          s.ticker === ticker.toUpperCase()
            ? {
                ...s,
                quote,
                metrics,
                score,
                loading: false,
              }
            : s
        )
      );
    } catch (error) {
      setStocks((prev) =>
        prev.map((s) =>
          s.ticker === ticker.toUpperCase() ? { ...s, loading: false } : s
        )
      );
    }
  };

  const removeStock = (ticker: string) => {
    setStocks(stocks.filter((s) => s.ticker !== ticker));
  };

  // Transform for radar chart
  const categories = ['Valuation', 'Profitability', 'Financial Health', 'Momentum'];
  const chartData = categories.map((cat) => {
    const dataPoint: Record<string, number | string> = { category: cat };
    stocks.forEach((stock) => {
      if (!stock.loading) {
        // Simple breakdown for visualization
        const breakdown: Record<string, number> = {
          'Valuation': stock.metrics?.peRatio ? Math.min(100, (30 - stock.metrics.peRatio) * 3.33) : 50,
          'Profitability': stock.metrics?.roe ? Math.min(100, stock.metrics.roe * 100 * 2) : 50,
          'Financial Health': stock.metrics?.debtToEquity ? Math.max(0, (1 - stock.metrics.debtToEquity) * 100) : 50,
          'Momentum': stock.quote?.changesPercentage ? Math.min(100, 50 + stock.quote.changesPercentage * 2) : 50,
        };
        dataPoint[stock.ticker] = Math.max(0, Math.min(100, breakdown[cat] || 50));
      }
    });
    return dataPoint;
  });

  const colors = ['#c9a962', '#22c55e', '#3b82f6', '#ec4899'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="fixed inset-4 md:inset-10 lg:inset-20 bg-[#0a0a0a] border border-white/10 rounded-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="text-gold" size={24} />
                <h2 className="text-xl font-bold text-white">Stock Comparison</h2>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={onClose}
                className="border-white/20 text-white hover:bg-white/10"
              >
                <X size={18} />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Add Stock */}
              <div className="mb-6">
                {isAdding ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && searchQuery) {
                            addStock(searchQuery);
                          }
                        }}
                        placeholder="Enter ticker symbol..."
                        className="pl-10 bg-[#141414] border-white/10 text-white"
                        autoFocus
                      />
                    </div>
                    <Button
                      onClick={() => searchQuery && addStock(searchQuery)}
                      className="bg-gold hover:bg-gold-light text-[#0a0a0a]"
                    >
                      Add
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsAdding(false)}
                      className="border-white/20 text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setIsAdding(true)}
                    disabled={stocks.length >= 4}
                    variant="outline"
                    className="border-white/20 text-white/70 hover:text-white disabled:opacity-50"
                  >
                    <Plus size={18} className="mr-2" />
                    Add Stock ({stocks.length}/4)
                  </Button>
                )}
              </div>

              {stocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ArrowRightLeft size={48} className="text-white/20 mb-4" />
                  <h3 className="text-white font-semibold mb-2">Compare Stocks</h3>
                  <p className="text-white/50 text-sm max-w-md">
                    Add up to 4 stocks to compare their metrics, scores, and performance side by side
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4 text-white/50 font-medium">Metric</th>
                          {stocks.map((stock) => (
                            <th key={stock.ticker} className="text-center py-3 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-white font-semibold">{stock.ticker}</span>
                                <button
                                  onClick={() => removeStock(stock.ticker)}
                                  className="text-white/30 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Price */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">Price</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-4 bg-white/10 rounded animate-pulse mx-auto w-20" />
                              ) : stock.quote ? (
                                <span className="font-mono text-white">
                                  {formatCurrency(stock.quote.price)}
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* Change */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">Change</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-4 bg-white/10 rounded animate-pulse mx-auto w-16" />
                              ) : stock.quote ? (
                                <span
                                  className={
                                    stock.quote.change >= 0 ? 'text-green-500' : 'text-red-500'
                                  }
                                >
                                  {formatPercentage(stock.quote.changesPercentage)}
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* AI Score */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">AI Score</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-8 bg-white/10 rounded animate-pulse mx-auto w-16" />
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <ScoreVisualizer score={stock.score} size="sm" showLabel={false} />
                                  <span className={getScoreColor(stock.score)}>{stock.score}</span>
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* Signal */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">Signal</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-6 bg-white/10 rounded animate-pulse mx-auto w-16" />
                              ) : (
                                <SignalBadge
                                  signal={
                                    stock.score >= 70 ? 'buy' : stock.score >= 40 ? 'hold' : 'sell'
                                  }
                                  size="sm"
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* P/E */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">P/E Ratio</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-4 bg-white/10 rounded animate-pulse mx-auto w-12" />
                              ) : stock.metrics ? (
                                <span className="font-mono text-white">
                                  {stock.metrics.peRatio?.toFixed(2) || 'N/A'}
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* ROE */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">ROE</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-4 bg-white/10 rounded animate-pulse mx-auto w-12" />
                              ) : stock.metrics ? (
                                <span className="font-mono text-white">
                                  {((stock.metrics.roe || 0) * 100).toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* Debt/Equity */}
                        <tr className="border-b border-white/5">
                          <td className="py-3 px-4 text-white/70">Debt/Equity</td>
                          {stocks.map((stock) => (
                            <td key={stock.ticker} className="text-center py-3 px-4">
                              {stock.loading ? (
                                <div className="h-4 bg-white/10 rounded animate-pulse mx-auto w-12" />
                              ) : stock.metrics ? (
                                <span className="font-mono text-white">
                                  {(stock.metrics.debtToEquity || 0).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Radar Chart */}
                  {stocks.length >= 2 && chartData.length > 0 && (
                    <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-6">
                      <h3 className="text-white font-semibold mb-4">Score Comparison</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={chartData}>
                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                            <PolarAngleAxis
                              dataKey="category"
                              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                            />
                            <PolarRadiusAxis
                              angle={90}
                              domain={[0, 100]}
                              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                            />
                            {stocks.map((stock, index) => (
                              <Radar
                                key={stock.ticker}
                                name={stock.ticker}
                                dataKey={stock.ticker}
                                stroke={colors[index % colors.length]}
                                fill={colors[index % colors.length]}
                                fillOpacity={0.2}
                                strokeWidth={2}
                              />
                            ))}
                            <Legend />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

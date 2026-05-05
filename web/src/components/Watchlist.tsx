import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Eye, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { stocksApi, type StockQuote } from '@/lib/api/stocks';
import { formatCurrency, formatPercentage } from '@/lib/utils';

interface WatchlistProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStock: (ticker: string) => void;
}

export function Watchlist({ isOpen, onClose, onSelectStock }: WatchlistProps) {
  const [watchlist] = useLocalStorage<string[]>('watchlist', []);
  const [alerts] = useLocalStorage<{ ticker: string; targetPrice: number; condition: string }[]>('price-alerts', []);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && watchlist.length > 0) {
      loadQuotes();
      // Refresh every 30 seconds
      const interval = setInterval(loadQuotes, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen, watchlist]);

  const loadQuotes = async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    try {
      const response = await stocksApi.getBatchQuotes(watchlist);
      if (response.data) {
        setQuotes(response.data);
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertCount = (ticker: string) => {
    return alerts.filter((a) => a.ticker === ticker).length;
  };

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 h-full w-full max-w-md bg-[#0a0a0a] border-r border-white/10 z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Eye className="text-gold" size={24} />
                <div>
                  <h2 className="text-xl font-bold text-white">Watchlist</h2>
                  <p className="text-white/50 text-sm">{watchlist.length} stocks</p>
                </div>
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
            <div className="flex-1 overflow-y-auto p-4">
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Eye size={48} className="text-white/20 mb-4" />
                  <h3 className="text-white font-semibold mb-2">Your watchlist is empty</h3>
                  <p className="text-white/50 text-sm mb-4">
                    Add stocks from the screener to track them here
                  </p>
                  <Button
                    onClick={onClose}
                    className="bg-gold hover:bg-gold-light text-[#0a0a0a]"
                  >
                    Browse Stocks
                  </Button>
                </div>
              ) : loading && quotes.length === 0 ? (
                <div className="space-y-3">
                  {watchlist.map((_, i) => (
                    <div
                      key={i}
                      className="h-20 bg-white/5 rounded-xl animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map((quote) => (
                    <motion.div
                      key={quote.symbol}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        onSelectStock(quote.symbol);
                        onClose();
                      }}
                      className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4 cursor-pointer hover:border-gold/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center">
                            <span className="text-gold font-bold">{quote.symbol[0]}</span>
                          </div>
                          <div>
                            <div className="font-semibold text-white">{quote.symbol}</div>
                            <div className="text-white/50 text-sm truncate max-w-[120px]">
                              {quote.name}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-white">
                            {formatCurrency(quote.price)}
                          </div>
                          <div
                            className={`flex items-center justify-end gap-1 text-sm ${
                              quote.change >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {quote.change >= 0 ? (
                              <TrendingUp size={12} />
                            ) : (
                              <TrendingDown size={12} />
                            )}
                            {formatPercentage(quote.changesPercentage)}
                          </div>
                        </div>
                      </div>
                      {getAlertCount(quote.symbol) > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-amber-500 text-xs">
                          <Bell size={12} />
                          <span>{getAlertCount(quote.symbol)} alert(s) set</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {watchlist.length > 0 && (
              <div className="p-4 border-t border-white/10">
                <Button
                  onClick={loadQuotes}
                  variant="outline"
                  className="w-full border-white/20 text-white/70 hover:text-white"
                >
                  Refresh Prices
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

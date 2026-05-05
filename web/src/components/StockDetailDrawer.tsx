import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Plus,
  Bell,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { stocksApi, type StockQuote, type KeyMetrics, type HistoricalPrice } from '@/lib/api/stocks';
import { formatCurrency, formatPercentage, formatVolume, getScoreColor } from '@/lib/utils';
import { mockStocks } from '@/lib/data';
import { SignalBadge } from './SignalBadge';
import { ScoreVisualizer } from './ScoreVisualizer';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface StockDetailDrawerProps {
  ticker: string;
  isOpen: boolean;
  onClose: () => void;
}

interface AlertPrice {
  ticker: string;
  targetPrice: number;
  condition: 'above' | 'below';
}

// Calculate score from quote and metrics
function calculateScore(quote: StockQuote | null, metrics: KeyMetrics | null): { score: number; breakdown: Record<string, number> } {
  if (!quote) {
    return { score: 50, breakdown: { valuation: 50, profitability: 50, financialHealth: 50, momentum: 50 } };
  }
  
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
  
  score = Math.max(0, Math.min(100, score));
  
  // Create breakdown
  const breakdown = {
    valuation: metrics?.peRatio ? Math.max(0, Math.min(100, (30 - metrics.peRatio) * 3.33)) : 50,
    profitability: metrics?.roe ? Math.min(100, metrics.roe * 100 * 2) : 50,
    financialHealth: metrics?.debtToEquity ? Math.max(0, (1 - metrics.debtToEquity) * 100) : 50,
    momentum: Math.min(100, Math.max(0, 50 + quote.changesPercentage * 2)),
  };
  
  return { score, breakdown };
}

export function StockDetailDrawer({ ticker, isOpen, onClose }: StockDetailDrawerProps) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<{ date: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage<string[]>('watchlist', []);
  const [alerts, setAlerts] = useLocalStorage<AlertPrice[]>('price-alerts', []);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [showAlertForm, setShowAlertForm] = useState(false);

  const isInWatchlist = watchlist.includes(ticker);

  useEffect(() => {
    if (isOpen && ticker) {
      loadStockData();
    }
  }, [isOpen, ticker]);

  const loadStockData = async () => {
    setLoading(true);
    setUsingDemoData(false);
    try {
      // Fetch all data in parallel
      const [quoteResponse, metricsResponse] = await Promise.all([
        stocksApi.getQuote(ticker),
        stocksApi.getKeyMetrics(ticker),
      ]);

      const quoteData = quoteResponse.data || null;
      const metricsData = metricsResponse.data || null;

      if (quoteData) {
        setQuote(quoteData);
        setMetrics(metricsData);

        // Fetch historical prices for chart
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const historicalResponse = await stocksApi.getHistorical(ticker, from, to);
        const historical = historicalResponse.data || [];
        
        if (historical.length > 0) {
          setHistoricalData(
            historical.map((h: HistoricalPrice) => ({
              date: h.date,
              price: h.close,
            }))
          );
        } else {
          // Generate mock historical data
          generateMockHistoricalData(quoteData.price, quoteData.change);
        }
      } else {
        // Fallback to mock data
        loadMockStockData();
      }
    } catch (error) {
      console.log('API error, using mock data for', ticker);
      loadMockStockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockStockData = () => {
    setUsingDemoData(true);
    const mockStock = mockStocks.find(s => s.ticker === ticker);
    if (mockStock) {
      setQuote({
        symbol: mockStock.ticker,
        name: mockStock.name,
        price: mockStock.price,
        changesPercentage: mockStock.changePercent,
        change: mockStock.change,
        dayLow: mockStock.price * 0.98,
        dayHigh: mockStock.price * 1.02,
        yearHigh: mockStock.fiftyTwoWeekHigh || mockStock.price * 1.2,
        yearLow: mockStock.fiftyTwoWeekLow || mockStock.price * 0.8,
        marketCap: mockStock.marketCap || 0,
        volume: mockStock.volume || 1000000,
        avgVolume: mockStock.avgVolume || 1000000,
        eps: 5.0,
        pe: mockStock.peRatio || 20,
      } as StockQuote);
      setMetrics({
        peRatio: mockStock.peRatio || 20,
        priceToBookRatio: mockStock.pbRatio || 3,
        priceToSalesRatio: mockStock.psRatio || 5,
        roe: 0.15,
        roa: 0.08,
        debtToEquity: 0.5,
        currentRatio: 2.0,
        quickRatio: 1.5,
        dividendYield: mockStock.dividendYield || 0,
      } as KeyMetrics);
      if (mockStock.sparklineData) {
        setHistoricalData(
          mockStock.sparklineData.map((price, i) => ({
            date: new Date(Date.now() - (mockStock.sparklineData!.length - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            price,
          }))
        );
      } else {
        generateMockHistoricalData(mockStock.price, mockStock.change);
      }
    }
  };

  const generateMockHistoricalData = (basePrice: number, change: number) => {
    const data: { date: string; price: number }[] = [];
    const days = 90;
    const changePerDay = change / days;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const randomVariation = (Math.random() - 0.5) * basePrice * 0.02;
      const price = basePrice - (changePerDay * i) + randomVariation;
      data.push({
        date: date.toISOString().split('T')[0],
        price: Math.max(0.01, price),
      });
    }
    setHistoricalData(data);
  };

  const toggleWatchlist = () => {
    if (isInWatchlist) {
      setWatchlist(watchlist.filter((t) => t !== ticker));
    } else {
      setWatchlist([...watchlist, ticker]);
    }
  };

  const addAlert = () => {
    const price = parseFloat(alertPrice);
    if (price > 0) {
      setAlerts([...alerts, { ticker, targetPrice: price, condition: alertCondition }]);
      setAlertPrice('');
      setShowAlertForm(false);
    }
  };

  const exportData = () => {
    if (!quote) return;
    
    const data = {
      ticker: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changesPercentage,
      marketCap: quote.marketCap,
      pe: quote.pe,
      volume: quote.volume,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scoreData = calculateScore(quote, metrics);
  const signal = scoreData.score >= 70 ? 'buy' : scoreData.score >= 40 ? 'hold' : 'sell';

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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-2xl bg-[#0a0a0a] border-l border-white/10 z-50 overflow-hidden flex flex-col"
          >
            {/* Demo Data Banner */}
            {usingDemoData && (
              <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-400 text-sm font-medium">
                  Demo Mode: Showing sample data. Real-time data temporarily unavailable.
                </span>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-4">
                {loading ? (
                  <div className="w-12 h-12 rounded-xl bg-white/10 animate-pulse" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                    <span className="text-[#0a0a0a] font-bold text-xl">
                      {ticker[0]}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-white">{ticker}</h2>
                  <p className="text-white/50">{quote?.name || 'Loading...'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleWatchlist}
                  className={`border-white/20 ${
                    isInWatchlist ? 'bg-gold/20 text-gold border-gold' : 'text-white'
                  }`}
                >
                  <Plus size={18} className={isInWatchlist ? 'rotate-45' : ''} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onClose}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-4">
                  <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
                  <div className="h-64 bg-white/5 rounded-xl animate-pulse" />
                  <div className="h-48 bg-white/5 rounded-xl animate-pulse" />
                </div>
              ) : quote ? (
                <div className="p-6 space-y-6">
                  {/* Price & Score */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <DollarSign size={16} />
                        <span className="text-sm">Current Price</span>
                      </div>
                      <div className="text-3xl font-bold text-white">
                        {formatCurrency(quote.price)}
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-1 ${
                          quote.change >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {quote.change >= 0 ? (
                          <TrendingUp size={16} />
                        ) : (
                          <TrendingDown size={16} />
                        )}
                        <span className="font-medium">
                          {quote.change >= 0 ? '+' : ''}
                          {formatPercentage(quote.changesPercentage)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <Activity size={16} />
                        <span className="text-sm">AI Score</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ScoreVisualizer
                          score={scoreData?.score || 50}
                          size="lg"
                          showLabel={false}
                        />
                        <div>
                          <div className={`text-3xl font-bold ${getScoreColor(scoreData?.score || 50)}`}>
                            {scoreData?.score || 50}
                          </div>
                          <SignalBadge signal={signal} size="sm" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Price Chart */}
                  <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-semibold">Price History (90 Days)</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportData}
                        className="border-white/20 text-white/70 hover:text-white"
                      >
                        <Download size={14} className="mr-2" />
                        Export
                      </Button>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={historicalData}>
                          <defs>
                            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#c9a962" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#c9a962" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis
                            dataKey="date"
                            stroke="rgba(255,255,255,0.3)"
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getMonth() + 1}/${date.getDate()}`;
                            }}
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            tickFormatter={(value) => `$${value}`}
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1f1f1f',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                            }}
                            labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                            itemStyle={{ color: '#c9a962' }}
                            formatter={(value: number) => [formatCurrency(value), 'Price']}
                          />
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#c9a962"
                            strokeWidth={2}
                            fill="url(#priceGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Tabs */}
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="w-full bg-[#1f1f1f] border border-white/10">
                      <TabsTrigger value="overview" className="flex-1 data-[state=active]:bg-gold data-[state=active]:text-[#0a0a0a]">
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="financials" className="flex-1 data-[state=active]:bg-gold data-[state=active]:text-[#0a0a0a]">
                        Financials
                      </TabsTrigger>
                      <TabsTrigger value="alerts" className="flex-1 data-[state=active]:bg-gold data-[state=active]:text-[#0a0a0a]">
                        Alerts
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4 space-y-4">
                      {/* Key Stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">Market Cap</span>
                          <div className="text-white font-medium">
                            {formatCurrency(quote.marketCap, 0)}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">Volume</span>
                          <div className="text-white font-medium">
                            {formatVolume(quote.volume)}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">P/E Ratio</span>
                          <div className="text-white font-medium">
                            {quote.pe?.toFixed(2) || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">EPS</span>
                          <div className="text-white font-medium">
                            {quote.eps?.toFixed(2) || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">52W High</span>
                          <div className="text-white font-medium">
                            {formatCurrency(quote.yearHigh)}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-3">
                          <span className="text-white/50 text-sm">52W Low</span>
                          <div className="text-white font-medium">
                            {formatCurrency(quote.yearLow)}
                          </div>
                        </div>
                      </div>

                      {/* Score Breakdown */}
                      {scoreData && (
                        <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4">
                          <h4 className="text-white font-semibold mb-4">Score Breakdown</h4>
                          <div className="space-y-3">
                            {Object.entries(scoreData.breakdown).map(([key, value]) => (
                              <div key={key}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-white/70 capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                  </span>
                                  <span className="text-gold font-medium">{value}</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${value}%` }}
                                    transition={{ duration: 0.8 }}
                                    className="h-full bg-gold rounded-full"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="financials" className="mt-4">
                      {metrics ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">ROE</span>
                            <div className="text-white font-medium">
                              {((metrics.roe || 0) * 100).toFixed(2)}%
                            </div>
                          </div>
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">ROA</span>
                            <div className="text-white font-medium">
                              {((metrics.roa || 0) * 100).toFixed(2)}%
                            </div>
                          </div>
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">Debt/Equity</span>
                            <div className="text-white font-medium">
                              {(metrics.debtToEquity || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">Current Ratio</span>
                            <div className="text-white font-medium">
                              {(metrics.currentRatio || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">P/B Ratio</span>
                            <div className="text-white font-medium">
                              {(metrics.priceToBookRatio || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-[#141414] rounded-lg p-3">
                            <span className="text-white/50 text-sm">P/S Ratio</span>
                            <div className="text-white font-medium">
                              {(metrics.priceToSalesRatio || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-white/50">
                          Financial data not available
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="alerts" className="mt-4">
                      <div className="space-y-4">
                        <Button
                          onClick={() => setShowAlertForm(!showAlertForm)}
                          className="w-full bg-gold hover:bg-gold-light text-[#0a0a0a]"
                        >
                          <Bell size={16} className="mr-2" />
                          Set Price Alert
                        </Button>

                        {showAlertForm && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="bg-[#1f1f1f] rounded-xl border border-white/10 p-4 space-y-3"
                          >
                            <div>
                              <label className="text-white/70 text-sm mb-1 block">
                                Target Price
                              </label>
                              <input
                                type="number"
                                value={alertPrice}
                                onChange={(e) => setAlertPrice(e.target.value)}
                                placeholder={quote.price.toFixed(2)}
                                className="w-full h-10 px-3 bg-[#141414] border border-white/10 rounded-lg text-white"
                              />
                            </div>
                            <div>
                              <label className="text-white/70 text-sm mb-1 block">
                                Condition
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setAlertCondition('above')}
                                  className={`flex-1 py-2 rounded-lg border ${
                                    alertCondition === 'above'
                                      ? 'bg-green-500/20 border-green-500 text-green-500'
                                      : 'border-white/20 text-white/70'
                                  }`}
                                >
                                  Goes Above
                                </button>
                                <button
                                  onClick={() => setAlertCondition('below')}
                                  className={`flex-1 py-2 rounded-lg border ${
                                    alertCondition === 'below'
                                      ? 'bg-red-500/20 border-red-500 text-red-500'
                                      : 'border-white/20 text-white/70'
                                  }`}
                                >
                                  Goes Below
                                </button>
                              </div>
                            </div>
                            <Button
                              onClick={addAlert}
                              className="w-full bg-white/10 hover:bg-white/20 text-white"
                            >
                              Create Alert
                            </Button>
                          </motion.div>
                        )}

                        {/* Existing Alerts */}
                        <div className="space-y-2">
                          {alerts
                            .filter((a) => a.ticker === ticker)
                            .map((alert, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between bg-[#141414] rounded-lg p-3"
                              >
                                <div className="flex items-center gap-2">
                                  <Bell size={14} className="text-gold" />
                                  <span className="text-white text-sm">
                                    {alert.condition === 'above' ? 'Above' : 'Below'}{' '}
                                    {formatCurrency(alert.targetPrice)}
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    setAlerts(alerts.filter((_, i) => i !== index))
                                  }
                                  className="text-white/40 hover:text-red-500"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          {alerts.filter((a) => a.ticker === ticker).length === 0 && (
                            <p className="text-white/40 text-sm text-center py-4">
                              No alerts set for {ticker}
                            </p>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  Failed to load stock data
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

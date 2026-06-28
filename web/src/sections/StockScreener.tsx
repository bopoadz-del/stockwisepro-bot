import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, ArrowUpDown, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { sectors } from '@/lib/data';
import { formatCurrency, formatPercentage, getScoreColor } from '@/lib/utils';
import { ScrollReveal } from '@/components/ScrollReveal';
import { SignalBadge } from '@/components/SignalBadge';
import { ScoreVisualizer } from '@/components/ScoreVisualizer';
import { SparklineChart } from '@/components/SparklineChart';
import { stocksApi, type StockQuote } from '@/lib/api/stocks';
import { useTranslation } from '@/contexts/LanguageContext';

// Format ticker for display (BRK-B -> BRK.B)
function formatTickerForDisplay(ticker: string): string {
  return ticker.replace(/-/g, '.');
}

type SortField = 'ticker' | 'price' | 'change' | 'score' | 'marketCap';
type SortDirection = 'asc' | 'desc';

interface StockResult {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  score: number;
  signal: 'buy' | 'hold' | 'sell';
  sector?: string;
  sparklineData?: number[];
  volume?: number;
  pe?: number;
}

interface StockScreenerProps {
  onSelectStock: (ticker: string) => void;
  isAuthenticated?: boolean;
}

// Determine signal from a numeric score


function getSignalFromScore(score: number): 'buy' | 'hold' | 'sell' {
  if (score >= 70) return 'buy';
  if (score >= 40) return 'hold';
  return 'sell';
}

function generateSparklineData(price: number, changePercent: number): number[] {
  const data: number[] = [];
  const points = 10;
  const volatility = Math.abs(changePercent) / 100 + 0.01;

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const basePrice = price * (1 - changePercent / 100 * (1 - progress));
    const noise = (Math.random() - 0.5) * price * volatility * 0.5;
    data.push(basePrice + noise);
  }

  data[points - 1] = price;
  return data;
}

function formatQuoteToResult(quote: StockQuote | null | undefined): StockResult | null {
  if (!quote || typeof quote !== 'object') return null;
  const safe = {
    symbol: quote.symbol || 'UNKNOWN',
    name: quote.name || 'Unknown',
    price: typeof quote.price === 'number' ? quote.price : 0,
    change: typeof quote.change === 'number' ? quote.change : 0,
    changesPercentage: typeof quote.changesPercentage === 'number' ? quote.changesPercentage : 0,
    marketCap: typeof quote.marketCap === 'number' ? quote.marketCap : 0,
    pe: typeof quote.pe === 'number' ? quote.pe : 20,
    volume: typeof quote.volume === 'number' ? quote.volume : 0,
    avgVolume: typeof quote.avgVolume === 'number' ? quote.avgVolume : (typeof quote.volume === 'number' ? quote.volume : 0),
  };
  // Use backend OpenBox score when available; otherwise neutral 50
  const score = typeof quote.score === 'number' ? quote.score : 50;
  const signal = quote.signal || getSignalFromScore(score);
  return {
    ticker: formatTickerForDisplay(safe.symbol),
    name: safe.name,
    price: safe.price,
    change: safe.change,
    changePercent: safe.changesPercentage,
    marketCap: safe.marketCap,
    score,
    signal,
    sector: quote.sector || undefined,
    volume: safe.volume,
    pe: safe.pe,
    sparklineData: generateSparklineData(safe.price, safe.changesPercentage),
  };
}

export function StockScreener({ onSelectStock, isAuthenticated: _isAuthenticated }: StockScreenerProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [stocks, setStocks] = useState<StockResult[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadInitialData = async () => {
      if (!mounted) return;
      setInitialLoading(true);
      setError(null);
      try {
        const response = await stocksApi.getScreener();
        if (response.error) {
          setError(response.error);
          setStocks([]);
          return;
        }
        if (response.data && Array.isArray(response.data)) {
          const formatted = response.data.map(formatQuoteToResult).filter(Boolean) as StockResult[];
          setStocks(formatted);
        } else {
          setStocks([]);
        }
      } catch (err) {
        setError(t('screener.errorLoad'));
        setStocks([]);
      } finally {
        if (mounted) setInitialLoading(false);
      }
    };
    loadInitialData();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      if (stocks.length === 0 && !initialLoading) {
        // Reload screener if cleared and empty
        stocksApi.getScreener().then((res) => {
          if (res.data) {
            const formatted = res.data.map(formatQuoteToResult).filter(Boolean) as StockResult[];
            setStocks(formatted);
          }
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      performSearch(trimmedQuery);
    }, trimmedQuery.length < 2 ? 800 : 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const searchResponse = await stocksApi.search(query);
      if (searchResponse.data && searchResponse.data.length > 0) {
        const symbols = searchResponse.data.slice(0, 5).map((r: any) => r.symbol);
        const quotesResponse = await stocksApi.getBatchQuotes(symbols);
        if (quotesResponse.data && Array.isArray(quotesResponse.data)) {
          const formatted = quotesResponse.data.map(formatQuoteToResult).filter(Boolean) as StockResult[];
          setStocks(formatted);
          return;
        }
      }
      // If search returned no results, try direct quote
      const direct = await stocksApi.getQuote(query.toUpperCase());
      if (direct.data && direct.data.price > 0) {
        const formatted = formatQuoteToResult(direct.data);
        if (formatted) {
          setStocks([formatted]);
          return;
        }
      }
      setStocks([]);
    } catch (err) {
      setError(t('screener.searchFailed'));
      setStocks([]);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredStocks = useMemo(() => {
    let result = [...stocks];
    if (selectedSector) {
      result = result.filter((stock) => stock.sector === selectedSector);
    }
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'change':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'marketCap':
          comparison = a.marketCap - b.marketCap;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [stocks, selectedSector, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSelectedSector(null);
    setError(null);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-white/30" />;
    return sortDirection === 'asc' ? (
      <ChevronUp size={14} className="text-gold" />
    ) : (
      <ChevronDown size={14} className="text-gold" />
    );
  };

  return (
    <section id="screener" className="py-20 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              {t('screener.title')} <span className="text-gradient-gold">{t('screener.titleHighlight')}</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              {t('screener.subtitle')}
            </p>
          </div>
        </ScrollReveal>

        {/* Search and Filters */}
        <ScrollReveal delay={0.1}>
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
              <Input
                placeholder={t('screener.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-10 h-12 bg-[#141414] border-white/10 text-white placeholder:text-white/40 focus:border-gold focus:ring-gold/20"
              />
              {(searchQuery || isSearching) && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <X size={18} />
                  )}
                </button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-12 px-6 border-white/20 text-white hover:bg-white/10 ${
                showFilters ? 'bg-white/10 border-gold' : ''
              }`}
            >
              <Filter size={18} className="mr-2" />
              {t('screener.filters')}
              {(selectedSector) && (
                <Badge variant="secondary" className="ml-2 bg-gold text-[#0a0a0a]">
                  {[selectedSector].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>
        </ScrollReveal>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <span className="text-red-400 text-sm font-medium">{error}</span>
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-6 p-4 bg-[#141414] rounded-xl border border-white/10"
          >
            <div className="flex flex-wrap gap-2">
              <span className="text-white/60 text-sm py-2">{t('screener.sector')}</span>
              <button
                onClick={() => setSelectedSector(null)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  !selectedSector
                    ? 'bg-gold text-[#0a0a0a] font-medium'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {t('screener.all')}
              </button>
              {sectors.map((sector) => (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    selectedSector === sector
                      ? 'bg-gold text-[#0a0a0a] font-medium'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {sector}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Results Table */}
        <ScrollReveal delay={0.2}>
          <div className="bg-[#141414] rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/60">
                      <button
                        onClick={() => handleSort('ticker')}
                        className="flex items-center gap-2 hover:text-white transition-colors"
                      >
                        {t('screener.col.stock')}
                        <SortIcon field="ticker" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        {t('screener.col.price')}
                        <SortIcon field="price" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('change')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        {t('screener.col.change')}
                        <SortIcon field="change" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 hidden md:table-cell">{t('screener.col.chart')}</TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('score')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        {t('screener.col.score')}
                        <SortIcon field="score" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-center">{t('screener.col.signal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index} className="border-white/5">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />
                            <div>
                              <div className="h-4 w-12 bg-white/5 rounded animate-pulse mb-1" />
                              <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-12 bg-white/5 rounded animate-pulse ml-auto" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-8 bg-white/5 rounded animate-pulse ml-auto" />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="h-6 w-12 bg-white/5 rounded animate-pulse mx-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredStocks.map((stock, index) => (
                      <motion.tr
                        key={stock.ticker}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => onSelectStock(stock.ticker)}
                        className="border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                              <span className="text-white font-bold text-sm">{stock.ticker[0]}</span>
                            </div>
                            <div>
                              <div className="font-semibold text-white">{stock.ticker}</div>
                              <div className="text-white/50 text-sm truncate max-w-[150px]">{stock.name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-white">
                            {formatCurrency(stock.price)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className={`font-mono ${
                              stock.change >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            <div>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}</div>
                            <div className="text-sm">{formatPercentage(stock.changePercent)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="w-24">
                            <SparklineChart
                              data={stock.sparklineData || []}
                              isPositive={stock.change >= 0}
                              height={30}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            <ScoreVisualizer score={stock.score} size="sm" showLabel={false} />
                            <span className={`font-bold ${getScoreColor(stock.score)}`}>
                              {stock.score}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <SignalBadge signal={stock.signal} size="sm" />
                        </TableCell>
                      </motion.tr>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {!initialLoading && filteredStocks.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-white/50">
                  {searchQuery
                    ? t('screener.noResultsFor', { query: searchQuery })
                    : error || t('screener.noStocks')}
                </p>
                <Button
                  variant="ghost"
                  onClick={handleClearSearch}
                  className="mt-4 text-gold hover:text-gold-light"
                >
                  {t('screener.clearSearch')}
                </Button>
              </div>
            )}
          </div>
        </ScrollReveal>

        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs">
            {t('screener.dataProvider')}
          </p>
        </div>
      </div>
    </section>
  );
}

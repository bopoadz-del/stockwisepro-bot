import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { sectors, mockStocks } from '@/lib/data';
import { formatCurrency, formatPercentage, getScoreColor } from '@/lib/utils';
import { toast } from 'sonner';
import { ScrollReveal } from '@/components/ScrollReveal';
import { SignalBadge } from '@/components/SignalBadge';
import { ScoreVisualizer } from '@/components/ScoreVisualizer';
import { SparklineChart } from '@/components/SparklineChart';
import { stocksApi, type StockQuote } from '@/lib/api/stocks';

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



// Calculate score based on available metrics
function calculateScore(stock: StockQuote | null | undefined): number {
  // Safety check for null/undefined stock
  if (!stock || typeof stock !== 'object') {
    return 50; // Return default score
  }
  
  let score = 50; // Base score
  
  // Factor in P/E ratio (lower is better for value)
  if (typeof stock.pe === 'number' && stock.pe > 0) {
    if (stock.pe < 15) score += 15;
    else if (stock.pe < 25) score += 10;
    else if (stock.pe < 40) score += 5;
    else score -= 5;
  }
  
  // Factor in market cap (stability)
  if (typeof stock.marketCap === 'number' && stock.marketCap > 0) {
    if (stock.marketCap > 500000000000) score += 10; // Large cap
    else if (stock.marketCap > 100000000000) score += 5;
  }
  
  // Factor in price momentum
  if (typeof stock.changesPercentage === 'number') {
    if (stock.changesPercentage > 5) score += 10;
    else if (stock.changesPercentage > 0) score += 5;
    else if (stock.changesPercentage < -5) score -= 10;
    else if (stock.changesPercentage < 0) score -= 5;
  }
  
  // Factor in volume (liquidity)
  if (typeof stock.volume === 'number' && typeof stock.avgVolume === 'number' && stock.avgVolume > 0) {
    const volumeRatio = stock.volume / stock.avgVolume;
    if (volumeRatio > 1.5) score += 10;
    else if (volumeRatio > 1) score += 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

function getSignalFromScore(score: number): 'buy' | 'hold' | 'sell' {
  if (score >= 70) return 'buy';
  if (score >= 40) return 'hold';
  return 'sell';
}

// Generate sparkline data based on price and change
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
  
  // Ensure the last point matches current price
  data[points - 1] = price;
  
  return data;
}

export function StockScreener({ onSelectStock, isAuthenticated: _isAuthenticated }: StockScreenerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [stocks, setStocks] = useState<StockResult[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(false);

  // Load screener stocks on mount - only once
  useEffect(() => {
    let mounted = true;
    
    const loadInitialData = async () => {
      if (!mounted) return;
      await loadScreenerStocks();
    };
    
    loadInitialData();
    
    return () => { mounted = false; };
  }, []);

  // Debounced search - only when user types, not on initial load
  useEffect(() => {
    // Skip initial mount - only run when searchQuery actually changes from user input
    if (searchQuery === '' && stocks.length === 0) {
      // Initial load case - loadScreenerStocks is called in the other useEffect
      return;
    }
    
    // Don't search for very short queries (less than 2 chars) unless it's a known ticker
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery && trimmedQuery.length < 2) {
      // Allow single char search but add a longer delay
      const timer = setTimeout(() => {
        performSearch(trimmedQuery);
      }, 800); // Longer delay for single char to avoid rapid firing
      return () => clearTimeout(timer);
    }
    
    const timer = setTimeout(() => {
      if (trimmedQuery) {
        performSearch(trimmedQuery);
      } else if (stocks.length > 0) {
        // Only reload screener if we already had stocks (user cleared search)
        loadScreenerStocks();
      }
    }, 500); // Increased debounce to 500ms

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadScreenerStocks = async () => {
    setInitialLoading(true);
    setUsingDemoData(false);
    try {
      console.log('Fetching screener data...');
      const response = await stocksApi.getScreener();
      console.log('Screener response:', response);
      
      if (response.error) {
        console.error('Screener API error:', response.error);
        loadMockStocks();
        return;
      }
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const formattedStocks: StockResult[] = [];
        
        for (let i = 0; i < response.data.length; i++) {
          const quote = response.data[i];
          
          // Defensive: skip invalid quotes
          if (!quote || typeof quote !== 'object') {
            console.warn(`Invalid quote at index ${i}:`, quote);
            continue;
          }
          
          try {
            const safeQuote = {
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
            
            const score = calculateScore(safeQuote as StockQuote);
            
            formattedStocks.push({
              ticker: formatTickerForDisplay(safeQuote.symbol),
              name: safeQuote.name,
              price: safeQuote.price,
              change: safeQuote.change,
              changePercent: safeQuote.changesPercentage,
              marketCap: safeQuote.marketCap,
              score: score,
              signal: getSignalFromScore(score),
              volume: safeQuote.volume,
              pe: safeQuote.pe,
              sparklineData: generateSparklineData(safeQuote.price, safeQuote.changesPercentage),
            });
          } catch (itemError) {
            console.warn(`Error processing quote at index ${i}:`, itemError);
          }
        }
        
        if (formattedStocks.length > 0) {
          console.log('Setting stocks:', formattedStocks.length);
          setStocks(formattedStocks);
          setUsingDemoData(false); // Ensure demo mode is OFF when we have real data
        } else {
          console.warn('No formatted stocks, using mock');
          loadMockStocks();
        }
      } else {
        // API returned empty - use mock data
        console.warn('API returned empty data, using mock');
        loadMockStocks();
      }
    } catch (error) {
      console.error('Screener API error:', error);
      loadMockStocks();
    } finally {
      setInitialLoading(false);
    }
  };

  const loadMockStocks = () => {
    setUsingDemoData(true);
    toast.info('Using demo data - API temporarily unavailable');
    const formattedStocks: StockResult[] = mockStocks.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      marketCap: stock.marketCap || 0,
      score: stock.score,
      signal: stock.signal,
      sector: stock.sector,
      volume: stock.volume,
      pe: stock.peRatio,
      sparklineData: stock.sparklineData,
    }));
    setStocks(formattedStocks);
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    setUsingDemoData(false);
    try {
      // First, search for matching symbols
      const searchResponse = await stocksApi.search(query);
      console.log('Search response for query "' + query + '":', searchResponse);
      
      if (searchResponse.data && searchResponse.data.length > 0) {
        // Fetch quotes for the matching stocks (max 5 at a time to avoid API limits)
        const symbols = searchResponse.data.slice(0, 5).map(r => r.symbol);
        console.log('Fetching batch quotes for symbols:', symbols);
        
        const quotesResponse = await stocksApi.getBatchQuotes(symbols);
        console.log('Batch quotes response:', quotesResponse);
        
        if (quotesResponse.data && Array.isArray(quotesResponse.data) && quotesResponse.data.length > 0) {
          const formattedStocks: StockResult[] = [];
          
          for (let i = 0; i < quotesResponse.data.length; i++) {
            const quote = quotesResponse.data[i];
            
            // Defensive: skip invalid quotes
            if (!quote || typeof quote !== 'object') {
              console.warn(`Invalid quote at index ${i}:`, quote);
              continue;
            }
            
            try {
              const safeQuote = {
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
              
              const score = calculateScore(safeQuote as StockQuote);
              
              formattedStocks.push({
                ticker: formatTickerForDisplay(safeQuote.symbol),
                name: safeQuote.name,
                price: safeQuote.price,
                change: safeQuote.change,
                changePercent: safeQuote.changesPercentage,
                marketCap: safeQuote.marketCap,
                score: score,
                signal: getSignalFromScore(score),
                volume: safeQuote.volume,
                pe: safeQuote.pe,
                sparklineData: generateSparklineData(safeQuote.price, safeQuote.changesPercentage),
              });
            } catch (itemError) {
              console.warn(`Error processing quote at index ${i}:`, itemError);
            }
          }
          
          if (formattedStocks.length > 0) {
            console.log('Setting stocks from API:', formattedStocks.length);
            setStocks(formattedStocks);
          } else {
            console.log('No formatted stocks from API, falling back to mock');
            searchMockStocks(query);
          }
        } else {
          // API returned empty quotes - try individual quote fetches as fallback
          console.log('Batch quotes empty, trying individual fetches for:', symbols.slice(0, 3));
          const individualStocks: StockResult[] = [];
          
          // Try to fetch at least a few individual quotes
          for (const symbol of symbols.slice(0, 3)) {
            try {
              const quoteResponse = await stocksApi.getQuote(symbol);
              if (quoteResponse.data && quoteResponse.data.price > 0) {
                const quote = quoteResponse.data;
                const score = calculateScore(quote);
                individualStocks.push({
                  ticker: formatTickerForDisplay(quote.symbol),
                  name: quote.name,
                  price: quote.price,
                  change: quote.change,
                  changePercent: quote.changesPercentage,
                  marketCap: quote.marketCap,
                  score: score,
                  signal: getSignalFromScore(score),
                  volume: quote.volume,
                  pe: quote.pe,
                  sparklineData: generateSparklineData(quote.price, quote.changesPercentage),
                });
              }
            } catch (e) {
              console.warn(`Individual quote fetch failed for ${symbol}:`, e);
            }
          }
          
          if (individualStocks.length > 0) {
            console.log('Setting stocks from individual fetches:', individualStocks.length);
            setStocks(individualStocks);
          } else {
            console.log('Individual fetches also failed, using mock data');
            searchMockStocks(query);
          }
        }
      } else {
        // API search returned empty - use mock search
        console.log('Search API returned no results, using mock data');
        searchMockStocks(query);
      }
    } catch (error) {
      console.error('Search API error:', error);
      searchMockStocks(query);
    } finally {
      setIsSearching(false);
    }
  };

  const searchMockStocks = (query: string) => {
    setUsingDemoData(true);
    const lowerQuery = query.toLowerCase();
    const filtered = mockStocks.filter(
      stock => 
        stock.ticker.toLowerCase().includes(lowerQuery) ||
        stock.name.toLowerCase().includes(lowerQuery)
    );
    const formattedStocks: StockResult[] = filtered.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      marketCap: stock.marketCap || 0,
      score: stock.score,
      signal: stock.signal,
      sector: stock.sector,
      volume: stock.volume,
      pe: stock.peRatio,
      sparklineData: stock.sparklineData,
    }));
    setStocks(formattedStocks);
  };

  // Filter and sort stocks
  const filteredStocks = useMemo(() => {
    let result = [...stocks];

    // Sector filter (note: real API may not have sector data for all stocks)
    if (selectedSector) {
      // Since FMP API doesn't always provide sector in basic quote,
      // we'll keep this filter but it may not work for all stocks
      result = result.filter((stock) => stock.sector === selectedSector);
    }

    // Sort
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
    loadScreenerStocks();
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
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
              Stock <span className="text-gradient-gold">Screener</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Search over 85,000+ stocks, ETFs, and cryptocurrencies in real-time. 
              Filter by sector, valuation, and our proprietary AI score.
            </p>
          </div>
        </ScrollReveal>

        {/* Demo Data Banner */}
        {usingDemoData && (
          <ScrollReveal delay={0.05}>
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-400 text-sm font-medium">
                Demo Mode: Showing sample stock data. Real-time data temporarily unavailable.
              </span>
            </div>
          </ScrollReveal>
        )}

        {/* Search and Filters */}
        <ScrollReveal delay={0.1}>
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
              <Input
                placeholder="Search any stock (e.g., AAPL, Tesla, Bitcoin)..."
                value={searchQuery}
                onChange={handleSearchInputChange}
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
              Filters
              {(selectedSector) && (
                <Badge variant="secondary" className="ml-2 bg-gold text-[#0a0a0a]">
                  {[selectedSector].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>
        </ScrollReveal>

        {/* Search Results Info */}
        <AnimatePresence>
          {searchQuery && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-center justify-between bg-[#141414] rounded-lg px-4 py-3 border border-white/10">
                <span className="text-white/70">
                  Found <span className="text-gold font-semibold">{filteredStocks.length}</span> results for &quot;{searchQuery}&quot;
                  {isSearching && <span className="ml-2 text-white/40">(searching...)</span>}
                </span>
                <button
                  onClick={handleClearSearch}
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Clear search
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-6 p-4 bg-[#141414] rounded-xl border border-white/10"
          >
            <div className="flex flex-wrap gap-2">
              <span className="text-white/60 text-sm py-2">Sector:</span>
              <button
                onClick={() => setSelectedSector(null)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  !selectedSector
                    ? 'bg-gold text-[#0a0a0a] font-medium'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                All
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
                        Stock
                        <SortIcon field="ticker" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        Price
                        <SortIcon field="price" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('change')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        Change
                        <SortIcon field="change" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 hidden md:table-cell">Chart</TableHead>
                    <TableHead className="text-white/60 text-right">
                      <button
                        onClick={() => handleSort('score')}
                        className="flex items-center justify-end gap-2 hover:text-white transition-colors w-full"
                      >
                        Score
                        <SortIcon field="score" />
                      </button>
                    </TableHead>
                    <TableHead className="text-white/60 text-center">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialLoading ? (
                    // Loading skeleton
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
                    ? `No stocks found matching "${searchQuery}"`
                    : 'No stocks available'}
                </p>
                <Button
                  variant="ghost"
                  onClick={handleClearSearch}
                  className="mt-4 text-gold hover:text-gold-light"
                >
                  Clear Search
                </Button>
              </div>
            )}
          </div>
        </ScrollReveal>

        {/* Data attribution */}
        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs">
            Real-time data provided by Financial Modeling Prep API
          </p>
        </div>
      </div>
    </section>
  );
}

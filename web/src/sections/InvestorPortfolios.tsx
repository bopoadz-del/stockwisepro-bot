import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, PieChart, Check, TrendingUp, Users, Target, Shield, Sparkles, Globe, BarChart3, Building2, Landmark, Calculator, Zap, Briefcase, Loader2, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/utils';
import { ScrollReveal } from '@/components/ScrollReveal';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { apiClient } from '@/lib/api/client';
import { stocksApi } from '@/lib/api/stocks';
import { useTranslation } from '@/contexts/LanguageContext';

const icons: Record<string, React.ElementType> = {
  buffett: TrendingUp,
  dalio: Shield,
  wood: Sparkles,
  lynch: Target,
  graham: Users,
  soros: Globe,
  druckenmiller: BarChart3,
  ackman: Building2,
  templeton: Landmark,
  marks: Calculator,
  simons: Zap,
  icahn: Briefcase,
};

interface InvestorData {
  id: string;
  name: string;
  style: string;
  description: string;
  sectorTargets?: Record<string, number>;
  criteria?: any;
  coreHoldings?: Array<{ ticker: string; name: string; allocation?: number }>;
  color?: string;
}

interface PortfolioHolding {
  ticker: string;
  name: string;
  allocation: number;
  price: number;
  shares: number;
  value: number;
}

interface PortfolioResult {
  investor: string;
  investorName: string;
  budget: number;
  holdings: PortfolioHolding[];
  totalValue: number;
  cashRemaining: number;
  ethicsApplied: boolean;
  replacedTickers: Array<{ old: string; new: string; reason: string }>;
}

interface InvestorPortfoliosProps {
  isAuthenticated?: boolean;
}

export function InvestorPortfolios({ isAuthenticated }: InvestorPortfoliosProps) {
  const { t } = useTranslation();
  const [investors, setInvestors] = useState<InvestorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorData | null>(null);
  const [budget, setBudget] = useState('10000');
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [ethicsEnabled, setEthicsEnabled] = useState(false);
  const [portfolioResult, setPortfolioResult] = useState<PortfolioResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setSavedTickers] = useState<Set<string>>(new Set());

  const budgetNum = parseFloat(budget) || 0;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<InvestorData[]>('/investors');
        if (res.data && res.data.length > 0) {
          setInvestors(res.data);
          setSelectedInvestor(res.data[0]);
        }
      } catch (err) {
        console.error('Failed to load investors', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const generatePortfolio = async () => {
    if (!selectedInvestor || budgetNum < 1000) return;
    setGenerating(true);
    setShowPortfolio(false);
    setPortfolioResult(null);
    try {
      const res = await stocksApi.portfolioMimic(selectedInvestor.id, budgetNum, ethicsEnabled);
      if (res.data) {
        setPortfolioResult(res.data);
        setShowPortfolio(true);
      } else {
        console.error('Portfolio mimic failed', res.error);
      }
    } catch (err) {
      console.error('Failed to generate portfolio', err);
    } finally {
      setGenerating(false);
    }
  };

  const saveToWatchlist = async (ticker: string) => {
    if (!isAuthenticated) return;
    setSaving(true);
    try {
      await apiClient.post('/watchlist', { ticker });
      setSavedTickers(prev => new Set(prev).add(ticker));
    } catch (err) {
      console.error('Failed to save to watchlist', err);
    } finally {
      setSaving(false);
    }
  };

  const portfolioData = portfolioResult?.holdings.map((holding) => ({
    name: holding.ticker,
    value: holding.allocation,
    fullName: holding.name,
  })) || [];

  if (loading) {
    return (
      <section id="portfolios" className="py-20 bg-[#0a0a0a]">
        <div className="max-w-[1400px] mx-auto px-4 text-center">
          <Loader2 className="animate-spin text-gold mx-auto" size={32} />
          <p className="text-white/60 mt-4">{t('investors.loadingProfiles')}</p>
        </div>
      </section>
    );
  }

  if (!selectedInvestor) return null;

  return (
    <section id="portfolios" className="py-20 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              {t('investors.title')} <span className="text-gradient-gold">{t('investors.titleHighlight')}</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              {t('investors.subtitle')}
            </p>
          </div>
        </ScrollReveal>

        {/* Investor Cards */}
        <ScrollReveal delay={0.1}>
          <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
            {investors.map((investor) => {
              const Icon = icons[investor.id] || TrendingUp;
              const color = investor.color || '#8B5CF6';
              return (
                <motion.button
                  key={investor.id}
                  onClick={() => {
                    setSelectedInvestor(investor);
                    setShowPortfolio(false);
                    setPortfolioResult(null);
                  }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex-shrink-0 w-64 p-5 rounded-xl border text-left transition-all ${
                    selectedInvestor.id === investor.id
                      ? 'border-gold bg-gold/10'
                      : 'border-white/10 bg-[#1f1f1f] hover:border-white/20'
                  }`}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon size={24} style={{ color }} />
                  </div>
                  <h3 className="text-white font-semibold mb-1">{investor.name}</h3>
                  <p className="text-white/50 text-sm mb-3">{investor.style}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {(investor.coreHoldings?.length || 0)} {t('investors.holdings')}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Selected Investor Details */}
        <div className="grid lg:grid-cols-2 gap-8">
          <ScrollReveal delay={0.2}>
            <Card className="bg-[#1f1f1f] border-white/10">
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${selectedInvestor.color || '#8B5CF6'}20` }}
                  >
                    {(() => {
                      const Icon = icons[selectedInvestor.id] || TrendingUp;
                      return <Icon size={32} style={{ color: selectedInvestor.color || '#8B5CF6' }} />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">{selectedInvestor.name}</h3>
                    <p className="text-gold">{selectedInvestor.style}</p>
                  </div>
                </div>

                <p className="text-white/70 mb-6">{selectedInvestor.description}</p>

                <div>
                  <h4 className="text-white/50 text-sm uppercase tracking-wider mb-3">
                    {t('investors.topHoldings')}
                  </h4>
                  <div className="space-y-2">
                    {selectedInvestor.coreHoldings?.slice(0, 5).map((holding, index) => (
                      <div
                        key={holding.ticker}
                        className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-white/30 text-sm">{index + 1}</span>
                          <div>
                            <span className="text-white font-medium">{holding.ticker}</span>
                            <span className="text-white/50 text-sm ml-2">{holding.name}</span>
                          </div>
                        </div>
                        <span className="text-gold font-medium">{holding.allocation || 10}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Portfolio Builder */}
          <ScrollReveal delay={0.3}>
            <Card className="bg-[#1f1f1f] border-white/10">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-6">{t('investors.portfolioBuilder')}</h3>

                <div className="mb-6">
                  <label className="text-white/70 text-sm mb-2 block">{t('investors.investmentBudget')}</label>
                  <div className="relative">
                    <DollarSign
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                    />
                    <Input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className="pl-12 h-14 bg-[#141414] border-white/10 text-white text-lg font-mono focus:border-gold"
                      placeholder="10000"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6 p-3 bg-[#141414] rounded-lg border border-white/5">
                  <div className="flex items-center gap-3">
                    <Leaf size={18} className="text-green-400" />
                    <div>
                      <p className="text-white text-sm font-medium">{t('investors.ethicalInvesting')}</p>
                      <p className="text-white/50 text-xs">{t('investors.excludeHarmful')}</p>
                    </div>
                  </div>
                  <Switch
                    checked={ethicsEnabled}
                    onCheckedChange={setEthicsEnabled}
                  />
                </div>

                <Button
                  onClick={generatePortfolio}
                  disabled={budgetNum < 1000 || generating}
                  className="w-full h-14 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold text-lg mb-6 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 size={20} className="mr-2 animate-spin" />
                  ) : (
                    <PieChart size={20} className="mr-2" />
                  )}
                  {generating ? t('investors.buildingPortfolio') : t('investors.generatePortfolio')}
                </Button>

                <AnimatePresence>
                  {showPortfolio && portfolioResult && budgetNum >= 1000 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-white/10 pt-6"
                    >
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-[#141414] rounded-lg p-4">
                          <span className="text-white/50 text-sm">{t('investors.portfolioValue')}</span>
                          <div className="text-2xl font-bold text-white">
                            {formatCurrency(portfolioResult.totalValue)}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-4">
                          <span className="text-white/50 text-sm">{t('investors.cashRemaining')}</span>
                          <div className="text-2xl font-bold text-gold">
                            {formatCurrency(portfolioResult.cashRemaining)}
                          </div>
                        </div>
                      </div>

                      {portfolioResult.ethicsApplied && (
                        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Leaf size={16} className="text-green-400" />
                            <span className="text-green-400 text-sm font-medium">
                              {t('investors.ethicalApplied')}
                            </span>
                          </div>
                          {portfolioResult.replacedTickers.length > 0 && (
                            <p className="text-white/50 text-xs mt-1">
                              {t('investors.tickersReplaced', { count: portfolioResult.replacedTickers.length })}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="h-48 mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={portfolioData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {portfolioData.map((_entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={
                                    [
                                      selectedInvestor.color || '#8B5CF6',
                                      '#22c55e',
                                      '#3b82f6',
                                      '#f59e0b',
                                      '#ec4899',
                                    ][index % 5]
                                  }
                                />
                              ))}
                            </Pie>
                            <ReTooltip
                              contentStyle={{
                                backgroundColor: '#1f1f1f',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                              }}
                              itemStyle={{ color: '#fff' }}
                            />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {portfolioResult.holdings.map((holding, index) => (
                          <div
                            key={holding.ticker}
                            className="flex items-center justify-between py-2 px-3 bg-[#141414] rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{
                                  backgroundColor:
                                    [
                                      selectedInvestor.color || '#8B5CF6',
                                      '#22c55e',
                                      '#3b82f6',
                                      '#f59e0b',
                                      '#ec4899',
                                    ][index % 5],
                                }}
                              />
                              <div>
                                <span className="text-white font-medium">{holding.ticker}</span>
                                <span className="text-white/50 text-sm ml-2">{holding.name}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-white/50">{t('investors.sharesAt', { shares: holding.shares, price: formatCurrency(holding.price) })}</span>
                              <span className="text-gold">
                                {formatCurrency(holding.value)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {isAuthenticated && (
                        <Button
                          variant="outline"
                          className="w-full mt-4 border-gold text-gold hover:bg-gold/10"
                          onClick={() => {
                            portfolioResult.holdings.forEach(h => saveToWatchlist(h.ticker));
                          }}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 size={18} className="mr-2 animate-spin" />
                          ) : (
                            <Check size={18} className="mr-2" />
                          )}
                          {t('investors.saveAllWatchlist')}
                        </Button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {budgetNum < 1000 && budgetNum > 0 && (
                  <p className="text-amber-500 text-sm text-center">
                    {t('investors.minBudget')}
                  </p>
                )}
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

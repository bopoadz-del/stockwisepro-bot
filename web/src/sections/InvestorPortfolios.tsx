import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, PieChart, Check, TrendingUp, Users, Target, Shield, Sparkles, Globe, BarChart3, Building2, Landmark, Calculator, Zap, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { investors } from '@/lib/data';
import { formatCurrency } from '@/lib/utils';
import { ScrollReveal } from '@/components/ScrollReveal';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';

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

interface InvestorPortfoliosProps {
  isAuthenticated?: boolean;
}

export function InvestorPortfolios({ isAuthenticated: _isAuthenticated }: InvestorPortfoliosProps) {
  const [selectedInvestor, setSelectedInvestor] = useState(investors[0]);
  const [budget, setBudget] = useState('10000');
  const [showPortfolio, setShowPortfolio] = useState(false);

  const budgetNum = parseFloat(budget) || 0;

  const portfolioData = selectedInvestor.topHoldings.map((holding) => ({
    name: holding.ticker,
    value: holding.allocation,
    fullName: holding.name,
  }));

  const generatePortfolio = () => {
    setShowPortfolio(true);
  };

  return (
    <section id="portfolios" className="py-20 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Invest Like the <span className="text-gradient-gold">Legends</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Mimic the strategies of history's greatest investors within your budget. Our AI
              creates a personalized portfolio based on their proven approaches.
            </p>
          </div>
        </ScrollReveal>

        {/* Investor Cards */}
        <ScrollReveal delay={0.1}>
          <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
            {investors.map((investor) => {
              const Icon = icons[investor.id] || TrendingUp;
              return (
                <motion.button
                  key={investor.id}
                  onClick={() => {
                    setSelectedInvestor(investor);
                    setShowPortfolio(false);
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
                    style={{ backgroundColor: `${investor.color}20` }}
                  >
                    <Icon size={24} style={{ color: investor.color }} />
                  </div>
                  <h3 className="text-white font-semibold mb-1">{investor.name}</h3>
                  <p className="text-white/50 text-sm mb-3">{investor.title}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${investor.color}20`, color: investor.color }}
                    >
                      {investor.topHoldings.length} Holdings
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
                    style={{ backgroundColor: `${selectedInvestor.color}20` }}
                  >
                    {(() => {
                      const Icon = icons[selectedInvestor.id] || TrendingUp;
                      return <Icon size={32} style={{ color: selectedInvestor.color }} />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">{selectedInvestor.name}</h3>
                    <p className="text-gold">{selectedInvestor.title}</p>
                  </div>
                </div>

                <p className="text-white/70 mb-6">{selectedInvestor.description}</p>

                <div className="mb-6">
                  <h4 className="text-white/50 text-sm uppercase tracking-wider mb-3">
                    Investment Strategy
                  </h4>
                  <p className="text-white/70 text-sm">{selectedInvestor.strategy}</p>
                </div>

                <div>
                  <h4 className="text-white/50 text-sm uppercase tracking-wider mb-3">
                    Top Holdings
                  </h4>
                  <div className="space-y-2">
                    {selectedInvestor.topHoldings.slice(0, 5).map((holding, index) => (
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
                        <span className="text-gold font-medium">{holding.allocation}%</span>
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
                <h3 className="text-xl font-semibold text-white mb-6">Portfolio Builder</h3>

                {/* Budget Input */}
                <div className="mb-6">
                  <label className="text-white/70 text-sm mb-2 block">Your Investment Budget</label>
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

                {/* Generate Button */}
                <Button
                  onClick={generatePortfolio}
                  disabled={budgetNum < 1000}
                  className="w-full h-14 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold text-lg mb-6 disabled:opacity-50"
                >
                  <PieChart size={20} className="mr-2" />
                  Generate Portfolio
                </Button>

                {/* Portfolio Results */}
                <AnimatePresence>
                  {showPortfolio && budgetNum >= 1000 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-white/10 pt-6"
                    >
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-[#141414] rounded-lg p-4">
                          <span className="text-white/50 text-sm">Portfolio Value</span>
                          <div className="text-2xl font-bold text-white">
                            {formatCurrency(budgetNum * 0.98)}
                          </div>
                        </div>
                        <div className="bg-[#141414] rounded-lg p-4">
                          <span className="text-white/50 text-sm">Cash Remaining</span>
                          <div className="text-2xl font-bold text-gold">
                            {formatCurrency(budgetNum * 0.02)}
                          </div>
                        </div>
                      </div>

                      {/* Allocation Chart */}
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
                                      selectedInvestor.color,
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

                      {/* Holdings List */}
                      <div className="space-y-2">
                        {selectedInvestor.topHoldings.slice(0, 5).map((holding, index) => {
                          const allocationValue = (budgetNum * holding.allocation) / 100;
                          const shares = Math.floor(allocationValue / 150);

                          return (
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
                                        selectedInvestor.color,
                                        '#22c55e',
                                        '#3b82f6',
                                        '#f59e0b',
                                        '#ec4899',
                                      ][index % 5],
                                  }}
                                />
                                <span className="text-white font-medium">{holding.ticker}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-white/50">{shares} shares</span>
                                <span className="text-gold">
                                  {formatCurrency(allocationValue)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        variant="outline"
                        className="w-full mt-4 border-gold text-gold hover:bg-gold/10"
                      >
                        <Check size={18} className="mr-2" />
                        Save to Watchlist
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {budgetNum < 1000 && budgetNum > 0 && (
                  <p className="text-amber-500 text-sm text-center">
                    Minimum budget is $1,000
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

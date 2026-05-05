import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, TrendingUp, Search, Briefcase, BarChart3, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const demoSteps = [
  {
    title: 'AI-Powered Stock Scores',
    description: 'Get instant stock analysis with our transparent scoring system. Each stock is rated on 5 key dimensions: Valuation, Profitability, Growth, Financial Health, and Momentum.',
    icon: TrendingUp,
    visual: (
      <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">AAPL Score</span>
          <span className="text-3xl font-bold text-green-500">78</span>
        </div>
        <div className="space-y-2">
          {['Valuation', 'Profitability', 'Growth', 'Financial Health'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-white/60 text-sm w-24">{label}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light" 
                  style={{ width: `${70 + i * 5}%` }}
                />
              </div>
              <span className="text-white text-sm w-8">{70 + i * 5}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    title: 'Legendary Investor Portfolios',
    description: 'Mimic the strategies of investing legends like Warren Buffett, Ray Dalio, and Cathie Wood. See what stocks they own and how their portfolios perform.',
    icon: Briefcase,
    visual: (
      <div className="space-y-3">
        {[
          { name: 'Warren Buffett', return: '+12.4%', stocks: 'AAPL, BAC, KO' },
          { name: 'Ray Dalio', return: '+8.7%', stocks: 'SPY, GLD, TLT' },
          { name: 'Cathie Wood', return: '+15.2%', stocks: 'TSLA, COIN, ROKU' },
        ].map((investor) => (
          <div key={investor.name} className="bg-[#1f1f1f] rounded-lg p-3 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">{investor.name}</p>
              <p className="text-white/50 text-xs">{investor.stocks}</p>
            </div>
            <span className="text-green-500 font-semibold text-sm">{investor.return}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    title: 'Advanced Stock Screener',
    description: 'Filter through thousands of stocks with our powerful screener. Find stocks that match your criteria by score, market cap, sector, P/E ratio, and more.',
    icon: Search,
    visual: (
      <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-8 bg-[#141414] rounded-lg border border-white/10" />
          <div className="w-20 h-8 bg-gold rounded-lg" />
        </div>
        <div className="space-y-2">
          {['Score: 70+', 'Market Cap: Large', 'P/E: < 30'].map((filter) => (
            <div key={filter} className="flex items-center gap-2">
              <div className="px-3 py-1 bg-gold/10 border border-gold/30 rounded-full text-gold text-xs">
                {filter}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-white/50 text-xs">245 stocks match your criteria</p>
        </div>
      </div>
    )
  },
  {
    title: 'Portfolio Analysis',
    description: 'Track your portfolio performance, get diversification insights, and receive personalized recommendations to optimize your investments.',
    icon: BarChart3,
    visual: (
      <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
        <div className="flex items-end gap-2 h-24 mb-4">
          {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
            <div 
              key={i} 
              className="flex-1 bg-gradient-to-t from-gold/50 to-gold rounded-t-sm"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-white/50">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-white/70 text-sm">Portfolio Value</span>
          <span className="text-green-500 font-semibold">$24,560.80</span>
        </div>
      </div>
    )
  },
  {
    title: 'Secure & Transparent',
    description: 'Your data is encrypted and secure. Our scoring methodology is fully transparent - see exactly how each score is calculated with detailed breakdowns.',
    icon: Shield,
    visual: (
      <div className="bg-[#1f1f1f] rounded-xl p-6 border border-white/10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
          <Shield className="w-8 h-8 text-green-500" />
        </div>
        <p className="text-white font-semibold mb-2">Bank-Level Security</p>
        <p className="text-white/50 text-sm">256-bit encryption · SOC 2 Compliant · GDPR Ready</p>
        <div className="mt-4 flex justify-center gap-4">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <div className="w-2 h-2 rounded-full bg-green-500" />
        </div>
      </div>
    )
  }
];

export function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < demoSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
      setCurrentStep(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleClose = () => {
    onClose();
    setCurrentStep(0);
  };

  const step = demoSteps[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 px-4"
          >
            <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gold" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Product Tour</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-white/50" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-white/70 mb-6 leading-relaxed">
                      {step.description}
                    </p>
                    <div className="mb-6">
                      {step.visual}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Progress dots */}
                <div className="flex justify-center gap-2 mb-6">
                  {demoSteps.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentStep 
                          ? 'bg-gold w-6' 
                          : 'bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                    className="flex-1 border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold"
                  >
                    {currentStep === demoSteps.length - 1 ? 'Get Started' : 'Next'}
                    {currentStep < demoSteps.length - 1 && <ChevronRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

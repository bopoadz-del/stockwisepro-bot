import { useState, useEffect } from 'react';

import { Navbar } from './sections/Navbar';
import { Hero } from './sections/Hero';
import { LiveMarketData } from './sections/LiveMarketData';
import { StockScreener } from './sections/StockScreener';
import { ScoringSystem } from './sections/ScoringSystem';
import { InvestorPortfolios } from './sections/InvestorPortfolios';

import { FAQ } from './sections/FAQ';
import { CTABanner } from './sections/CTABanner';
import { Footer } from './sections/Footer';
import { LiveTicker } from './components/LiveTicker';
import { StockDetailDrawer } from './components/StockDetailDrawer';
import { Watchlist } from './components/Watchlist';
import { StockComparison } from './components/StockComparison';
import { ScreenshotUploader } from './components/ScreenshotUploader';

import { AuthModal } from './components/AuthModal';
import { Button } from './components/ui/button';
import { Eye, ArrowRightLeft, User, LogOut } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useTranslation } from './contexts/LanguageContext';
import { analytics } from './lib/analytics';
import { toast } from 'sonner';
import './App.css';

function App() {
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useTranslation();

  // Track page views
  useEffect(() => {
    analytics.trackPageView();
  }, []);

  // Set user ID in analytics when authenticated
  useEffect(() => {
    if (user?.id) {
      analytics.setUserId(String(user.id));
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    toast.success(t('app.loggedOut'));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar 
        onLoginClick={() => setIsAuthOpen(true)} 
        user={user}
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
      />
      
      {/* Floating Action Buttons */}
      <div className="fixed right-4 bottom-4 z-40 flex flex-col gap-2">
        {isAuthenticated && (
          <>
            <Button
              onClick={() => setIsWatchlistOpen(true)}
              className="bg-gold hover:bg-gold-light text-[#0a0a0a] shadow-lg"
            >
              <Eye size={18} className="mr-2" />
              {t('app.watchlist')}
            </Button>
            <Button
              onClick={() => setIsComparisonOpen(true)}
              variant="outline"
              className="bg-[#1f1f1f] border-white/20 text-white hover:bg-white/10"
            >
              <ArrowRightLeft size={18} className="mr-2" />
              {t('app.compare')}
            </Button>
          </>
        )}
        
        {/* Auth Button */}
        {!isAuthenticated ? (
          <Button
            onClick={() => setIsAuthOpen(true)}
            variant="outline"
            className="bg-[#1f1f1f] border-white/20 text-white hover:bg-white/10"
          >
            <User size={18} className="mr-2" />
            {t('app.signIn')}
          </Button>
        ) : (
          <Button
            onClick={handleLogout}
            variant="outline"
            className="bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
          >
            <LogOut size={18} className="mr-2" />
            {t('app.logout')}
          </Button>
        )}
      </div>

      <main>
        <Hero onCtaClick={() => setIsAuthOpen(true)} />
        <LiveTicker />
        <LiveMarketData />
        <StockScreener 
          onSelectStock={setSelectedStock} 
          isAuthenticated={isAuthenticated}
        />
        
        <ScoringSystem />
        <InvestorPortfolios isAuthenticated={isAuthenticated} />
        <FAQ />
        <CTABanner onCtaClick={() => setIsAuthOpen(true)} />
      </main>
      
      <Footer />

      {/* Modals/Drawers */}
      <StockDetailDrawer
        ticker={selectedStock || ''}
        isOpen={!!selectedStock}
        onClose={() => setSelectedStock(null)}
      />
      
      <Watchlist
        isOpen={isWatchlistOpen}
        onClose={() => setIsWatchlistOpen(false)}
        onSelectStock={setSelectedStock}
      />
      
      <StockComparison
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <ScreenshotUploader onSelectStock={setSelectedStock} />

    </div>
  );
}

export default App;

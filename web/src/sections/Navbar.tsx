import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, TrendingUp, User, LogOut, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

const navLinks = [
  { key: 'nav.dashboard', href: '#dashboard' },
  { key: 'nav.screener', href: '#screener' },
  { key: 'nav.portfolios', href: '#portfolios' },
];

interface NavbarProps {
  onLoginClick: () => void;
  user: { id: string | number; email: string; name: string | null; plan?: string } | null;
  isAuthenticated: boolean;
  onLogout: () => void;
}

export function Navbar({ onLoginClick, user, isAuthenticated, onLogout }: NavbarProps) {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/10'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
            {/* Logo */}
            <a href="#" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[#0a0a0a]" />
              </div>
              <span className="text-xl font-bold text-white">
                StockWise <span className="text-gold">Pro</span>
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  className="relative text-white/70 hover:text-white transition-colors duration-200 py-2 group"
                >
                  {t(link.key)}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gold transition-all duration-300 group-hover:w-full" />
                </a>
              ))}
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <LanguageToggle />
              {isAuthenticated ? (
                <>
                  {/* User Plan Badge */}
                  {user?.plan && user.plan !== 'FREE' && (
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                      user.plan === 'ELITE' 
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-gold/20 text-gold border border-gold/30'
                    }`}>
                      <Crown size={12} />
                      {user.plan}
                    </span>
                  )}
                  
                  {/* User Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                      <User size={16} className="text-[#0a0a0a]" />
                    </div>
                    <span className="text-white/70 text-sm">{user?.name || user?.email}</span>
                  </div>

                  <Button 
                    variant="ghost" 
                    onClick={onLogout}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                  >
                    <LogOut size={18} className="mr-2" />
                    {t('nav.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={onLoginClick}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                  >
                    {t('nav.signIn')}
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-0 z-40 bg-[#0a0a0a] pt-[72px] md:hidden"
          >
            <div className="flex flex-col p-6 gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  className="text-xl text-white/70 hover:text-white py-3 border-b border-white/10"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {t(link.key)}
                </a>
              ))}
              
              <div className="flex flex-col gap-3 mt-6">
                <LanguageToggle />
                {isAuthenticated ? (
                  <>
                    <div className="flex items-center gap-3 p-4 bg-[#1f1f1f] rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                        <User size={20} className="text-[#0a0a0a]" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{user?.name || user?.email}</p>
                        <p className="text-white/50 text-sm">{user?.plan ? `${user.plan} ${t('nav.planSuffix')}` : t('nav.freePlan')}</p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        onLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full border-white/20 text-white"
                    >
                      <LogOut size={18} className="mr-2" />
                      {t('nav.logout')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onLoginClick();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full border-white/20 text-white"
                    >
                      {t('nav.signIn')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

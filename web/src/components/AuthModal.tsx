import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, defaultTab = 'login' }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(defaultTab);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const modalWrapperRef = useRef<HTMLDivElement>(null);

  // Form states
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ name: '', email: '', password: '' });

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle global mouse events for smooth dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging from the drag handle or header
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle')) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await login(loginData.email, loginData.password);
    
    setIsLoading(false);

    if (result.success) {
      toast.success('Welcome back!');
      onClose();
    } else {
      toast.error(result.error || 'Login failed');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await register(signupData.email, signupData.password, signupData.name);
    
    setIsLoading(false);

    if (result.success) {
      toast.success('Account created successfully!');
      onClose();
    } else {
      toast.error(result.error || 'Registration failed');
    }
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal Container - handles positioning and dragging */}
          <div
            ref={modalWrapperRef}
            className="fixed z-50"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
              width: '100%',
              maxWidth: '28rem',
              maxHeight: '90vh',
              pointerEvents: 'none'
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{ pointerEvents: 'auto' }}
              className="w-full"
            >
              <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header - Draggable area */}
                <div 
                  className="drag-handle flex items-center justify-between p-4 border-b border-white/10 cursor-move select-none bg-gradient-to-r from-[#1a1a1a] to-[#141414]"
                  onMouseDown={handleMouseDown}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={18} className="text-white/30" />
                    <div className="flex gap-4">
                      <button
                        onClick={() => setActiveTab('login')}
                        className={`text-lg font-semibold transition-colors ${
                          activeTab === 'login' ? 'text-gold' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        onClick={() => setActiveTab('signup')}
                        className={`text-lg font-semibold transition-colors ${
                          activeTab === 'signup' ? 'text-gold' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Sign Up
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X size={20} className="text-white/50 hover:text-white" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                  {activeTab === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                          <Input
                            type="email"
                            value={loginData.email}
                            onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                            placeholder="you@example.com"
                            className="pl-10 bg-[#1f1f1f] border-white/10 text-white"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-white/70 text-sm mb-2">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            placeholder="••••••••"
                            className="pl-10 pr-10 bg-[#1f1f1f] border-white/10 text-white"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 text-white/50 cursor-pointer">
                          <input type="checkbox" className="rounded border-white/20 bg-[#1f1f1f]" />
                          Remember me
                        </label>
                        <button type="button" className="text-gold hover:text-gold-light">
                          Forgot password?
                        </button>
                      </div>

                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold"
                      >
                        {isLoading ? (
                          <Loader2 className="animate-spin" size={20} />
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleSignup} className="space-y-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                          <Input
                            type="text"
                            value={signupData.name}
                            onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                            placeholder="John Doe"
                            className="pl-10 bg-[#1f1f1f] border-white/10 text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-white/70 text-sm mb-2">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                          <Input
                            type="email"
                            value={signupData.email}
                            onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                            placeholder="you@example.com"
                            className="pl-10 bg-[#1f1f1f] border-white/10 text-white"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-white/70 text-sm mb-2">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={signupData.password}
                            onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                            placeholder="••••••••"
                            className="pl-10 pr-10 bg-[#1f1f1f] border-white/10 text-white"
                            required
                            minLength={8}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <p className="text-white/40 text-xs mt-1">Must be at least 8 characters</p>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-white/50">
                        <input type="checkbox" className="rounded border-white/20 bg-[#1f1f1f]" required />
                        I agree to the{' '}
                        <button type="button" className="text-gold hover:text-gold-light">Terms of Service</button>
                        {' '}and{' '}
                        <button type="button" className="text-gold hover:text-gold-light">Privacy Policy</button>
                      </div>

                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold"
                      >
                        {isLoading ? (
                          <Loader2 className="animate-spin" size={20} />
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </form>
                  )}

                  {/* Social Login */}
                  <div className="mt-6">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-[#141414] text-white/50">Or continue with</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-white text-sm">Google</span>
                      </button>
                      <button
                        type="button"
                        className="flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        <span className="text-white text-sm">GitHub</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

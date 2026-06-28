import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, User, Loader2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithEmail } = useAuth();
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const modalWrapperRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

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
          y: e.clientY - dragStartRef.current.y,
        });
      }
    };

    const handleMouseUp = () => setIsDragging(false);

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
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle')) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast.error(t('auth.invalidEmail'));
      return;
    }
    setIsLoading(true);
    const result = await signInWithEmail(trimmed, name.trim() || undefined);
    setIsLoading(false);

    if (result.success) {
      toast.success(t('auth.welcome'));
      setEmail('');
      setName('');
      onClose();
    } else {
      toast.error(result.error || t('auth.invalidEmail'));
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

          {/* Modal Container */}
          <div
            ref={modalWrapperRef}
            className="fixed z-50"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
              width: '100%',
              maxWidth: '26rem',
              maxHeight: '90vh',
              pointerEvents: 'none',
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
              <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col">
                {/* Header - Draggable area */}
                <div
                  className="drag-handle flex items-center justify-between p-4 border-b border-white/10 cursor-move select-none bg-gradient-to-r from-[#1a1a1a] to-[#141414]"
                  onMouseDown={handleMouseDown}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={18} className="text-white/30" />
                    <span className="text-lg font-semibold text-gold">{t('auth.title')}</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X size={20} className="text-white/50 hover:text-white" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  <p className="text-white/60 text-sm mb-5">{t('auth.subtitle')}</p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-white/70 text-sm mb-2">{t('auth.emailLabel')}</label>
                      <div className="relative">
                        <Mail className="absolute start-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="ps-10 bg-[#1f1f1f] border-white/10 text-white"
                          autoFocus
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="relative">
                        <User className="absolute start-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                        <Input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t('auth.namePlaceholder')}
                          className="ps-10 bg-[#1f1f1f] border-white/10 text-white"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={20} /> : t('auth.continue')}
                    </Button>
                  </form>

                  <p className="text-white/40 text-xs mt-4 text-center">{t('auth.note')}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

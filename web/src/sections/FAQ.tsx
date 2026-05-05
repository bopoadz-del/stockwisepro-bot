import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { faqItems } from '@/lib/data';
import { ScrollReveal } from '@/components/ScrollReveal';

export function FAQ() {
  const [openItem, setOpenItem] = useState<string | null>('1');

  return (
    <section className="py-20 bg-[#141414]">
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Frequently Asked <span className="text-gradient-gold">Questions</span>
            </h2>
            <p className="text-white/60">
              Everything you need to know about StockWise Pro.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="space-y-4">
            {faqItems.map((item) => (
              <div
                key={item.id}
                className="border border-white/10 rounded-xl overflow-hidden bg-[#1f1f1f]"
              >
                <button
                  onClick={() => setOpenItem(openItem === item.id ? null : item.id)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-white font-medium pr-4">{item.question}</span>
                  <motion.div
                    animate={{ rotate: openItem === item.id ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={20} className="text-white/50 flex-shrink-0" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {openItem === item.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 border-t border-white/10">
                        <p className="text-white/70 leading-relaxed pt-4">{item.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

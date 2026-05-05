import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/ScrollReveal';

interface CTABannerProps {
  onCtaClick?: () => void;
}

export function CTABanner({ onCtaClick }: CTABannerProps) {
  return (
    <section className="py-20 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1a1a1a] via-[#1f1f1f] to-[#141414] border border-white/10 p-12 lg:p-16">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gold/10 rounded-full blur-[100px]" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gold/5 rounded-full blur-[80px]" />
            </div>

            {/* Gold Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />

            <div className="relative text-center max-w-2xl mx-auto">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/10 border border-gold/30 text-gold text-sm font-medium mb-6"
              >
                <Sparkles size={16} />
                Limited Time: 14-Day Free Trial
              </motion.div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to Make Smarter Investment Decisions?
              </h2>

              <p className="text-white/60 text-lg mb-8">
                Join 50,000+ investors using StockWise Pro to analyze stocks, mimic legendary
                portfolios, and achieve their financial goals.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={onCtaClick}
                  className="bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold px-8 h-14 text-base group"
                >
                  Start Your Free Trial
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10 px-8 h-14 text-base"
                >
                  View Pricing
                </Button>
              </div>

              <p className="text-white/40 text-sm mt-6">
                No credit card required. Cancel anytime.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

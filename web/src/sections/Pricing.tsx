import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { pricingPlans } from '@/lib/data';
import { ScrollReveal } from '@/components/ScrollReveal';
import { cn } from '@/lib/utils';

const icons = [Zap, Sparkles, Crown];

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="py-20 bg-[#141414]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Choose Your <span className="text-gradient-gold">Plan</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto mb-8">
              Start free, upgrade when you're ready. All plans include core features with no hidden
              fees.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4">
              <span className={`text-sm ${!isAnnual ? 'text-white' : 'text-white/50'}`}>
                Monthly
              </span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
                className="data-[state=checked]:bg-gold"
              />
              <span className={`text-sm ${isAnnual ? 'text-white' : 'text-white/50'}`}>
                Annual
              </span>
              <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
                Save 20%
              </span>
            </div>
          </div>
        </ScrollReveal>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {pricingPlans.map((plan, index) => {
            const Icon = icons[index];
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;

            return (
              <ScrollReveal key={plan.id} delay={index * 0.1}>
                <motion.div
                  whileHover={{ y: -8 }}
                  className={cn(
                    'relative rounded-2xl p-6 lg:p-8 h-full flex flex-col',
                    plan.highlighted
                      ? 'bg-gradient-to-b from-gold/20 to-[#1f1f1f] border-2 border-gold'
                      : 'bg-[#1f1f1f] border border-white/10'
                  )}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1.5 rounded-full bg-gold text-[#0a0a0a] text-sm font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                        plan.highlighted ? 'bg-gold/20' : 'bg-white/5'
                      )}
                    >
                      <Icon
                        size={24}
                        className={plan.highlighted ? 'text-gold' : 'text-white/60'}
                      />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <p className="text-white/50 text-sm">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">
                        ${price}
                      </span>
                      {price > 0 && (
                        <span className="text-white/50">/month</span>
                      )}
                    </div>
                    {isAnnual && price > 0 && (
                      <p className="text-white/40 text-sm mt-1">
                        Billed annually (${price * 12}/year)
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check
                          size={18}
                          className={cn(
                            'mt-0.5 flex-shrink-0',
                            plan.highlighted ? 'text-gold' : 'text-green-500'
                          )}
                        />
                        <span className="text-white/70 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={cn(
                      'w-full h-12 font-semibold',
                      plan.highlighted
                        ? 'bg-gold hover:bg-gold-light text-[#0a0a0a]'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/20'
                    )}
                  >
                    {plan.cta}
                  </Button>
                </motion.div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Trust Badges */}
        <ScrollReveal delay={0.4}>
          <div className="mt-12 text-center">
            <p className="text-white/40 text-sm mb-4">Trusted by investors worldwide</p>
            <div className="flex flex-wrap justify-center gap-8">
              {['SSL Secured', '30-Day Money Back', 'Cancel Anytime', '24/7 Support'].map(
                (badge) => (
                  <div key={badge} className="flex items-center gap-2 text-white/50">
                    <Check size={16} className="text-gold" />
                    <span className="text-sm">{badge}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

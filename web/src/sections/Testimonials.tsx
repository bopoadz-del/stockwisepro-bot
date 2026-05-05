import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { testimonials } from '@/lib/data';
import { ScrollReveal } from '@/components/ScrollReveal';

export function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const next = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  // Auto-advance
  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, []);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <section className="py-20 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Trusted by <span className="text-gradient-gold">50,000+</span> Investors
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              See what our users are saying about their experience with StockWise Pro.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="relative max-w-4xl mx-auto">
            {/* Quote Icon */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
              <Quote size={24} className="text-gold" />
            </div>

            {/* Testimonial Card */}
            <div className="bg-[#1f1f1f] rounded-2xl border border-white/10 p-8 lg:p-12 min-h-[320px] flex flex-col items-center justify-center text-center">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentIndex}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="w-full"
                >
                  {/* Rating */}
                  <div className="flex justify-center gap-1 mb-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={20}
                        className={
                          i < testimonials[currentIndex].rating
                            ? 'text-gold fill-gold'
                            : 'text-white/20'
                        }
                      />
                    ))}
                  </div>

                  {/* Quote */}
                  <p className="text-xl lg:text-2xl text-white leading-relaxed mb-8">
                    "{testimonials[currentIndex].content}"
                  </p>

                  {/* Author */}
                  <div className="flex items-center justify-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                      <span className="text-[#0a0a0a] font-bold text-xl">
                        {testimonials[currentIndex].name[0]}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-white font-semibold">
                        {testimonials[currentIndex].name}
                      </p>
                      <p className="text-white/50 text-sm">
                        {testimonials[currentIndex].role}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                size="icon"
                onClick={prev}
                className="w-12 h-12 rounded-full border-white/20 text-white hover:bg-white/10"
              >
                <ChevronLeft size={24} />
              </Button>

              {/* Dots */}
              <div className="flex gap-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setDirection(index > currentIndex ? 1 : -1);
                      setCurrentIndex(index);
                    }}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index === currentIndex
                        ? 'w-8 bg-gold'
                        : 'w-2 bg-white/30 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={next}
                className="w-12 h-12 rounded-full border-white/20 text-white hover:bg-white/10"
              >
                <ChevronRight size={24} />
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

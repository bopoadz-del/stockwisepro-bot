import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, RotateCcw, Save, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { defaultScoringCriteria } from '@/lib/data';
import { useScoring } from '@/hooks/useScoring';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ScoreVisualizer } from '@/components/ScoreVisualizer';
import { cn } from '@/lib/utils';

const presets = [
  { id: 'balanced', name: 'Balanced', description: 'Equal focus on all criteria' },
  { id: 'value', name: 'Value', description: 'Prioritizes low valuations' },
  { id: 'growth', name: 'Growth', description: 'Focuses on growth metrics' },
  { id: 'quality', name: 'Quality', description: 'Emphasizes profitability' },
];

export function ScoringSystem() {
  const { weights, updateWeight, resetWeights, totalWeight, isValid, applyPreset } = useScoring();
  const [expandedCriteria, setExpandedCriteria] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);

  const handleSave = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 3000);
  };

  const sampleScore = 78;

  return (
    <section className="py-20 bg-[#141414]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Transparent <span className="text-gradient-gold">Scoring System</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              See exactly how we calculate scores. Customize weights to match your investment
              strategy and risk tolerance.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Criteria List */}
          <ScrollReveal delay={0.1} className="lg:col-span-2">
            <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Scoring Criteria</h3>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isValid ? 'text-green-500' : 'text-amber-500'
                    )}
                  >
                    Total: {totalWeight}%
                  </span>
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="text-white/50 text-sm py-2">Presets:</span>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id as 'balanced' | 'value' | 'growth' | 'quality')}
                    className="px-3 py-1.5 rounded-full text-sm bg-white/5 text-white/70 hover:bg-gold/20 hover:text-gold transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {/* Criteria Items */}
              <div className="space-y-4">
                {defaultScoringCriteria.map((criterion) => (
                  <div
                    key={criterion.id}
                    className="border border-white/10 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedCriteria(
                          expandedCriteria === criterion.id ? null : criterion.id
                        )
                      }
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium">{criterion.name}</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info size={16} className="text-white/40 hover:text-white/60" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">{criterion.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gold font-bold">{weights[criterion.id as keyof typeof weights]}%</span>
                        {expandedCriteria === criterion.id ? (
                          <ChevronUp size={18} className="text-white/40" />
                        ) : (
                          <ChevronDown size={18} className="text-white/40" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedCriteria === criterion.id && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-2 border-t border-white/10">
                            <p className="text-white/60 text-sm mb-4">{criterion.description}</p>

                            {/* Weight Slider */}
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-white/50">Weight</span>
                                <span className="text-gold font-medium">
                                  {weights[criterion.id as keyof typeof weights]}%
                                </span>
                              </div>
                              <Slider
                                value={[weights[criterion.id as keyof typeof weights]]}
                                onValueChange={([value]) =>
                                  updateWeight(criterion.id as keyof typeof weights, value)
                                }
                                min={0}
                                max={100}
                                step={1}
                                className="w-full"
                              />
                            </div>

                            {/* Metrics */}
                            <div className="mt-4 space-y-2">
                              <span className="text-white/50 text-sm">Metrics included:</span>
                              <div className="flex flex-wrap gap-2">
                                {criterion.metrics.map((metric) => (
                                  <span
                                    key={metric.id}
                                    className="px-2 py-1 rounded-md bg-white/5 text-white/70 text-xs"
                                  >
                                    {metric.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={resetWeights}
                  className="flex-1 border-white/20 text-white/70 hover:bg-white/10"
                >
                  <RotateCcw size={16} className="mr-2" />
                  Reset
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!isValid}
                  className="flex-1 bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold disabled:opacity-50"
                >
                  <Save size={16} className="mr-2" />
                  Save Weights
                </Button>
              </div>

              {/* Save Toast */}
              <AnimatePresence>
                {showSaveToast && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2"
                  >
                    <Check size={16} className="text-green-500" />
                    <span className="text-green-500 text-sm">Weights saved successfully!</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollReveal>

          {/* Score Preview */}
          <ScrollReveal delay={0.2}>
            <div className="bg-[#1f1f1f] rounded-xl border border-white/10 p-6 sticky top-24">
              <h3 className="text-xl font-semibold text-white mb-6">Score Preview</h3>

              <div className="flex flex-col items-center mb-8">
                <ScoreVisualizer score={sampleScore} size="xl" />
                <div className="mt-4 text-center">
                  <span className="text-3xl font-bold text-white">AAPL</span>
                  <p className="text-white/50 text-sm">Apple Inc.</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-4">
                <h4 className="text-white/70 text-sm font-medium uppercase tracking-wider">
                  Breakdown
                </h4>
                {defaultScoringCriteria.map((criterion) => {
                  const weight = weights[criterion.id as keyof typeof weights];
                  const metricScore = criterion.metrics.reduce((sum, m) => sum + m.score, 0) / criterion.metrics.length;

                  return (
                    <div key={criterion.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/70">{criterion.name}</span>
                        <span className="text-white/50">
                          {metricScore.toFixed(0)} × {weight}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${metricScore}%` }}
                          transition={{ duration: 0.8, delay: 0.3 }}
                          className="h-full bg-gold rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Final Score */}
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Final Score</span>
                  <span className="text-2xl font-bold text-gold">{sampleScore}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-white/50 text-sm">Signal</span>
                  <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-500 font-semibold text-sm">
                    BUY
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

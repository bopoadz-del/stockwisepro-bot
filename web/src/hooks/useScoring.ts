import { useState, useCallback, useMemo } from 'react';
import type { ScoringWeights } from '@/types';
import { useLocalStorage } from './useLocalStorage';

const defaultWeights: ScoringWeights = {
  valuation: 25,
  profitability: 25,
  growth: 20,
  financialHealth: 15,
  momentum: 15,
};

export function useScoring() {
  const [weights, setWeights] = useLocalStorage<ScoringWeights>('scoring-weights', defaultWeights);
  const [isCustomized, setIsCustomized] = useState(false);

  /**
   * Auto-calibrate weights to always sum to 100%
   * When one weight changes, distribute the difference proportionally among other weights
   */
  const updateWeight = useCallback((key: keyof ScoringWeights, newValue: number) => {
    setWeights((prev) => {
      const oldValue = prev[key];
      const difference = newValue - oldValue;
      
      // Get other keys and their current weights
      const otherKeys = (Object.keys(prev) as Array<keyof ScoringWeights>).filter(k => k !== key);
      const otherWeightsSum = otherKeys.reduce((sum, k) => sum + prev[k], 0);
      
      // If no other weights, can't adjust
      if (otherWeightsSum === 0) {
        return prev;
      }

      const newWeights = { ...prev };
      
      // Distribute the difference proportionally among other weights
      let distributed = 0;
      otherKeys.forEach((k, index) => {
        const proportion = prev[k] / otherWeightsSum;
        let adjustment = Math.round(difference * proportion);
        
        // For the last key, adjust to ensure exact 100% total
        if (index === otherKeys.length - 1) {
          adjustment = difference - distributed;
        }
        
        // Ensure weight doesn't go below 0
        const newWeight = Math.max(0, prev[k] - adjustment);
        newWeights[k] = newWeight;
        distributed += (prev[k] - newWeight);
      });
      
      // Set the changed weight
      newWeights[key] = newValue;
      
      // Final validation: ensure total is exactly 100
      const total = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
      if (total !== 100) {
        // Adjust the largest weight to fix any rounding issues
        const largestKey = (Object.keys(newWeights) as Array<keyof ScoringWeights>)
          .reduce((a, b) => newWeights[a] > newWeights[b] ? a : b);
        newWeights[largestKey] += (100 - total);
      }
      
      setIsCustomized(true);
      return newWeights;
    });
  }, [setWeights]);

  const resetWeights = useCallback(() => {
    setWeights(defaultWeights);
    setIsCustomized(false);
  }, [setWeights]);

  const totalWeight = useMemo(() => {
    return Object.values(weights).reduce((sum, w) => sum + w, 0);
  }, [weights]);

  const isValid = useMemo(() => {
    return totalWeight === 100;
  }, [totalWeight]);

  const normalizedWeights = useMemo(() => {
    if (totalWeight === 0) return defaultWeights;
    const factor = 100 / totalWeight;
    return {
      valuation: Math.round(weights.valuation * factor),
      profitability: Math.round(weights.profitability * factor),
      growth: Math.round(weights.growth * factor),
      financialHealth: Math.round(weights.financialHealth * factor),
      momentum: Math.round(weights.momentum * factor),
    };
  }, [weights, totalWeight]);

  const presets = useMemo(() => ({
    balanced: defaultWeights,
    value: {
      valuation: 40,
      profitability: 25,
      growth: 10,
      financialHealth: 15,
      momentum: 10,
    },
    growth: {
      valuation: 10,
      profitability: 20,
      growth: 45,
      financialHealth: 10,
      momentum: 15,
    },
    quality: {
      valuation: 15,
      profitability: 45,
      growth: 15,
      financialHealth: 20,
      momentum: 5,
    },
  }), []);

  const applyPreset = useCallback((presetName: keyof typeof presets) => {
    setWeights(presets[presetName]);
    setIsCustomized(true);
  }, [presets, setWeights]);

  return {
    weights,
    normalizedWeights,
    updateWeight,
    resetWeights,
    totalWeight,
    isValid,
    isCustomized,
    presets,
    applyPreset,
  };
}

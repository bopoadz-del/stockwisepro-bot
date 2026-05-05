import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number, compact = false): string {
  if (compact && value >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  if (compact && value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  if (compact && value >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercentage(value: number, includeSign = true): string {
  const formatted = value.toFixed(2);
  if (includeSign && value > 0) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}

export function formatVolume(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }
  return value.toString();
}

export function getSignalColor(signal: 'buy' | 'hold' | 'sell'): string {
  switch (signal) {
    case 'buy':
      return 'text-green-500 bg-green-500/10 border-green-500/30';
    case 'hold':
      return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
    case 'sell':
      return 'text-red-500 bg-red-500/10 border-red-500/30';
    default:
      return 'text-gray-500 bg-gray-500/10 border-gray-500/30';
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-amber-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
}

export function getScoreGradient(score: number): string {
  if (score >= 80) return 'from-green-500 to-emerald-400';
  if (score >= 60) return 'from-amber-500 to-yellow-400';
  if (score >= 40) return 'from-yellow-500 to-orange-400';
  return 'from-red-500 to-orange-500';
}

export function calculateScore(
  peRatio: number,
  pbRatio: number,
  debtEquity: number,
  roe: number,
  revenueGrowth: number,
  weights: {
    valuation: number;
    profitability: number;
    growth: number;
    financialHealth: number;
    momentum: number;
  }
): number {
  // Valuation score (lower is better for P/E and P/B)
  const peScore = Math.max(0, Math.min(100, (30 - peRatio) * 3.33));
  const pbScore = Math.max(0, Math.min(100, (5 - pbRatio) * 20));
  const valuationScore = (peScore + pbScore) / 2;

  // Profitability score (higher ROE is better)
  const profitabilityScore = Math.min(100, roe * 5);

  // Growth score
  const growthScore = Math.min(100, revenueGrowth * 4);

  // Financial health score (lower debt/equity is better)
  const financialHealthScore = Math.max(0, Math.min(100, (1 - debtEquity) * 100));

  // Momentum score (placeholder, would use actual price data)
  const momentumScore = 50;

  // Weighted average
  const totalWeight = weights.valuation + weights.profitability + weights.growth + weights.financialHealth + weights.momentum;
  const weightedScore =
    (valuationScore * weights.valuation +
      profitabilityScore * weights.profitability +
      growthScore * weights.growth +
      financialHealthScore * weights.financialHealth +
      momentumScore * weights.momentum) /
    totalWeight;

  return Math.round(weightedScore);
}

export function generatePortfolio(
  budget: number,
  holdings: { ticker: string; name: string; allocation: number }[]
): { ticker: string; name: string; shares: number; price: number; allocation: number; value: number }[] {
  const portfolio = holdings.map((holding) => {
    // Mock price generation based on ticker
    const basePrice = holding.ticker.length * 15 + 50;
    const price = basePrice + Math.random() * 50;
    const targetValue = (budget * holding.allocation) / 100;
    const shares = Math.floor(targetValue / price);
    const actualValue = shares * price;

    return {
      ticker: holding.ticker,
      name: holding.name,
      shares,
      price: Math.round(price * 100) / 100,
      allocation: holding.allocation,
      value: Math.round(actualValue * 100) / 100,
    };
  });

  return portfolio.filter((p) => p.shares > 0);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour + minute / 60;

  // Market open Monday-Friday, 9:30 AM - 4:00 PM ET
  // Simplified check (assumes ET)
  if (day === 0 || day === 6) return false;
  if (time < 9.5 || time >= 16) return false;
  return true;
}

export function getMarketStatus(): { open: boolean; message: string } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (day === 0 || day === 6) {
    return { open: false, message: 'Market closed (Weekend)' };
  }

  const time = hour + minute / 60;
  if (time < 9.5) {
    const minutesUntilOpen = Math.floor((9.5 - time) * 60);
    return { open: false, message: `Opens in ${minutesUntilOpen}m` };
  }
  if (time >= 16) {
    return { open: false, message: 'Market closed' };
  }

  const minutesUntilClose = Math.floor((16 - time) * 60);
  return { open: true, message: `Closes in ${minutesUntilClose}m` };
}

/**
 * Financial math utilities: Monte Carlo simulation, risk metrics, etc.
 */

export interface GBMSimulationResult {
  currentPrice: number;
  days: number;
  simulations: number;
  meanFinal: number;
  medianFinal: number;
  percentile10: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  probUp: number; // probability price goes up
  probDown: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  paths: number[][]; // for potential charting
}

function randomNormal(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function simulateGBM(
  S0: number,
  mu: number, // annualized drift
  sigma: number, // annualized volatility
  T: number, // time in years
  steps: number,
  simulations: number
): GBMSimulationResult {
  const dt = T / steps;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const paths: number[][] = [];
  const finals: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let price = S0;
    const path = [price];
    for (let step = 0; step < steps; step++) {
      price = price * Math.exp(drift + diffusion * randomNormal());
      path.push(price);
    }
    paths.push(path);
    finals.push(price);
  }

  finals.sort((a, b) => a - b);
  const meanFinal = finals.reduce((a, b) => a + b, 0) / finals.length;
  const medianFinal = finals[Math.floor(finals.length / 2)];
  const percentile10 = finals[Math.floor(finals.length * 0.10)];
  const percentile25 = finals[Math.floor(finals.length * 0.25)];
  const percentile75 = finals[Math.floor(finals.length * 0.75)];
  const percentile90 = finals[Math.floor(finals.length * 0.90)];
  const probUp = finals.filter(p => p > S0).length / finals.length;

  return {
    currentPrice: S0,
    days: steps,
    simulations,
    meanFinal,
    medianFinal,
    percentile10,
    percentile25,
    percentile75,
    percentile90,
    probUp,
    probDown: 1 - probUp,
    annualizedReturn: mu,
    annualizedVolatility: sigma,
    paths,
  };
}

export function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((sq, n) => sq + (n - m) ** 2, 0) / values.length);
}

export function calculateAnnualizedVolatility(prices: number[]): number {
  const returns = calculateLogReturns(prices);
  if (returns.length < 2) return 0;
  const dailyStd = stdDev(returns);
  return dailyStd * Math.sqrt(252); // 252 trading days/year
}

export function calculateAnnualizedReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const totalReturn = Math.log(prices[prices.length - 1] / prices[0]);
  const years = prices.length / 252;
  return totalReturn / years;
}

export function calculateSharpeRatio(returns: number[], riskFreeRateAnnual = 0.045): number {
  if (returns.length < 2) return 0;
  const dailyRf = riskFreeRateAnnual / 252;
  const excessReturns = returns.map(r => r - dailyRf);
  const meanExcess = mean(excessReturns);
  const vol = stdDev(excessReturns);
  if (vol === 0) return 0;
  return (meanExcess / vol) * Math.sqrt(252);
}

export function calculateMaxDrawdown(prices: number[]): { maxDrawdown: number; peak: number; trough: number } {
  let peak = prices[0];
  let trough = prices[0];
  let maxDD = 0;

  for (const price of prices) {
    if (price > peak) {
      peak = price;
      trough = price;
    } else if (price < trough) {
      trough = price;
      const dd = (peak - trough) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }

  return { maxDrawdown: maxDD, peak, trough };
}

export function calculateVaR(returns: number[], confidence = 0.05): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * confidence);
  return sorted[idx];
}

export function simpleMovingAverage(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    sma.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return sma;
}

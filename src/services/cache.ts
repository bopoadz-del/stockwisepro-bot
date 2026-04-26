import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';
import { logger } from '../utils/logger';
import { config } from '../config';

let redis: Redis | null = null;
let upstash: UpstashRedis | null = null;

// ── Upstash REST (preferred for serverless / Render) ───────────────────────
if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
  try {
    upstash = new UpstashRedis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
    logger.info('Upstash Redis REST client initialized');
  } catch (err) {
    logger.warn('Upstash init failed', { error: (err as Error).message });
  }
}

// ── Native Redis (fallback) ────────────────────────────────────────────────
if (!upstash && config.redisUrl) {
  try {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    redis.on('error', (err) => {
      logger.warn('Redis error', { message: err.message });
    });
    logger.info('Native Redis client initialized');
  } catch (err) {
    logger.warn('Redis init failed', { error: (err as Error).message });
  }
}

export function isCacheAvailable(): boolean {
  return upstash !== null || (redis !== null && redis.status === 'ready');
}

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface CachedQuote {
  ticker: string;
  price: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  timestamp: number;
}

export interface CachedFundamentals {
  ticker: string;
  pe?: number;
  pb?: number;
  ps?: number;
  roe?: number;
  margin?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  debtToEquity?: number;
  currentRatio?: number;
  rsi?: number;
  priceChange6m?: number;
}

// ── TTLs ───────────────────────────────────────────────────────────────────

const TTL = {
  quote: 5,
  fundamentals: 3600,
  history: 900,
};

// ── Writers ────────────────────────────────────────────────────────────────

export async function cacheQuote(q: CachedQuote): Promise<void> {
  if (upstash) {
    try {
      await upstash.set(`stock:${q.ticker}:quote`, q, { ex: TTL.quote });
    } catch (err) {
      logger.warn('Upstash cacheQuote failed', { ticker: q.ticker, error: (err as Error).message });
    }
    return;
  }
  if (!redis) return;
  try {
    await redis.setex(`stock:${q.ticker}:quote`, TTL.quote, JSON.stringify(q));
  } catch (err) {
    logger.warn('Redis cacheQuote failed', { ticker: q.ticker, error: (err as Error).message });
  }
}

export async function cacheFundamentals(
  ticker: string,
  data: CachedFundamentals
): Promise<void> {
  if (upstash) {
    try {
      await upstash.set(`stock:${ticker}:fundamentals`, data, { ex: TTL.fundamentals });
    } catch (err) {
      logger.warn('Upstash cacheFundamentals failed', { ticker, error: (err as Error).message });
    }
    return;
  }
  if (!redis) return;
  try {
    await redis.setex(`stock:${ticker}:fundamentals`, TTL.fundamentals, JSON.stringify(data));
  } catch (err) {
    logger.warn('Redis cacheFundamentals failed', { ticker, error: (err as Error).message });
  }
}

// ── Readers ────────────────────────────────────────────────────────────────

export async function getCachedQuote(ticker: string): Promise<CachedQuote | null> {
  if (upstash) {
    try {
      const val = await upstash.get<CachedQuote>(`stock:${ticker}:quote`);
      return val || null;
    } catch (err) {
      logger.warn('Upstash getCachedQuote failed', { ticker, error: (err as Error).message });
      return null;
    }
  }
  if (!redis) return null;
  try {
    const raw = await redis.get(`stock:${ticker}:quote`);
    return raw ? (JSON.parse(raw) as CachedQuote) : null;
  } catch (err) {
    logger.warn('Redis getCachedQuote failed', { ticker, error: (err as Error).message });
    return null;
  }
}

export async function getCachedFundamentals(
  ticker: string
): Promise<CachedFundamentals | null> {
  if (upstash) {
    try {
      const val = await upstash.get<CachedFundamentals>(`stock:${ticker}:fundamentals`);
      return val || null;
    } catch (err) {
      logger.warn('Upstash getCachedFundamentals failed', { ticker, error: (err as Error).message });
      return null;
    }
  }
  if (!redis) return null;
  try {
    const raw = await redis.get(`stock:${ticker}:fundamentals`);
    return raw ? (JSON.parse(raw) as CachedFundamentals) : null;
  } catch (err) {
    logger.warn('Redis getCachedFundamentals failed', { ticker, error: (err as Error).message });
    return null;
  }
}

// ── In-memory fallback (per-process) ───────────────────────────────────────

const memQuoteCache = new Map<string, { data: CachedQuote; expires: number }>();
const memFundamentalsCache = new Map<string, { data: CachedFundamentals; expires: number }>();

export function memCacheQuote(q: CachedQuote): void {
  memQuoteCache.set(q.ticker, { data: q, expires: Date.now() + TTL.quote * 1000 });
}

export function memGetQuote(ticker: string): CachedQuote | null {
  const entry = memQuoteCache.get(ticker);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memQuoteCache.delete(ticker);
    return null;
  }
  return entry.data;
}

export function memCacheFundamentals(ticker: string, data: CachedFundamentals): void {
  memFundamentalsCache.set(ticker, { data, expires: Date.now() + TTL.fundamentals * 1000 });
}

export function memGetFundamentals(ticker: string): CachedFundamentals | null {
  const entry = memFundamentalsCache.get(ticker);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memFundamentalsCache.delete(ticker);
    return null;
  }
  return entry.data;
}

// ── Unified cache helpers (Redis/Upstash preferred, memory fallback) ───────

export async function setQuote(q: CachedQuote): Promise<void> {
  memCacheQuote(q);
  await cacheQuote(q);
}

export async function getQuote(ticker: string): Promise<CachedQuote | null> {
  const redisVal = await getCachedQuote(ticker);
  if (redisVal) return redisVal;
  return memGetQuote(ticker);
}

export async function setFundamentals(
  ticker: string,
  data: CachedFundamentals
): Promise<void> {
  memCacheFundamentals(ticker, data);
  await cacheFundamentals(ticker, data);
}

export async function getFundamentals(ticker: string): Promise<CachedFundamentals | null> {
  const redisVal = await getCachedFundamentals(ticker);
  if (redisVal) return redisVal;
  return memGetFundamentals(ticker);
}

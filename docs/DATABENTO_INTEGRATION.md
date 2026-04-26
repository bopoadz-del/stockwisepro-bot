# Databento → OpenBox Integration Architecture

> How to plug a professional market-data feed (Databento) into the existing Node.js / Telegraf bot backend.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABENTO CLOUD                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │  OPRA       │    │  NASDAQ     │    │  CME / Futures / Crypto         │  │
│  │  Options    │    │  TotalView  │    │  (future expansion)             │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────────────────────┘  │
│         │                  │                                                 │
│         └──────────────────┘                                                 │
│                    │                                                         │
│         ┌──────────▼──────────┐                                              │
│         │  Databento API      │  ← WebSocket / HTTP (JSON or DBN binary)    │
│         │  (normalized feed)  │                                              │
│         └──────────┬──────────┘                                              │
└────────────────────┼────────────────────────────────────────────────────────┘
                     │
                     │  WebSocket (wss://)
                     │  or HTTP polling
                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENBOX NODE BACKEND                                │
│                                                                             │
│  ┌──────────────────────┐      ┌──────────────────────┐                     │
│  │  Databento Adapter   │      │  Fallback Adapter    │                     │
│  │  (src/api/databento) │      │  (Yahoo / FMP)       │                     │
│  │  • WebSocket client  │      │  • REST polling      │                     │
│  │  • Reconnection      │      │  • On failure only   │                     │
│  │  • Heartbeat         │      │                      │                     │
│  └──────────┬───────────┘      └──────────────────────┘                     │
│             │                                                               │
│             │  Raw DBN / JSON messages                                       │
│             ▼                                                               │
│  ┌──────────────────────┐                                                   │
│  │  Normalizer          │  ← maps Databento schema → OpenBox schema        │
│  │  (src/services/norm) │                                                   │
│  └──────────┬───────────┘                                                   │
│             │  Normalized objects                                            │
│             ▼                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐                     │
│  │  Redis Cache         │◄────►│  TTL & Eviction      │                     │
│  │  (Upstash / local)   │      │  • Quotes: 5s        │                     │
│  │  • Streams           │      │  • Fundamentals: 1h  │                     │
│  │  • Pub/Sub           │      │  • History: 15m      │                     │
│  └──────────┬───────────┘      └──────────────────────┘                     │
│             │                                                               │
│             │  Cache hit → instant reply                                    │
│             │  Cache miss → fallback adapter                                │
│             ▼                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐                     │
│  │  Scoring Service     │      │  Alert Service       │                     │
│  │  (src/services/      │      │  (src/services/      │                     │
│  │   scoring.ts)        │      │   alerts.ts)         │                     │
│  │  • valuation         │      │  • price thresholds  │                     │
│  │  • profitability     │      │  • cross-market      │                     │
│  │  • momentum          │      │    alerts            │                     │
│  └──────────┬───────────┘      └──────────────────────┘                     │
│             │                                                               │
│             ▼                                                               │
│  ┌──────────────────────┐                                                   │
│  │  Telegraf Bot        │  ← /score, /mimic, /alert, /portfolio            │
│  │  (src/commands/*)    │                                                   │
│  └──────────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow (Sequence)

```text
1. Bot boots → DatabentoAdapter.connect() → auth with API key
2. Subscription request → "subscribe to AAPL, TSLA, SPY quotes + trades"
3. Databento pushes tick-by-tick messages via WebSocket
4. Adapter receives DBN binary → decodes to JSON
5. Normalizer maps fields:
     databento.px  → openbox.price
     databento.ts  → openbox.timestamp
     databento.bid → openbox.bid
     databento.ask → openbox.ask
     ...
6. Normalized object → Redis SETEX (5s TTL for quotes)
7. User sends /score AAPL
8. ScoreCommand reads from Redis (O(1)) → cache hit
9. If Redis miss → FallbackAdapter.fetch(AAPL) → backfills Redis
```

---

## 3. Component Sketches

### 3.1 Databento Adapter (`src/api/databento.ts`)

```typescript
import WebSocket from 'ws';
import { logger } from '../utils/logger';

const DATABENTO_WS = 'wss://hist.databento.com/v0/stream';
const DATABENTO_API_KEY = process.env.DATABENTO_API_KEY!;

export interface DatabentoQuote {
  symbol: string;
  ts: number;        // nanoseconds epoch
  px: number;        // price
  bid: number;
  ask: number;
  bs: number;        // bid size
  as: number;        // ask size
  vol: number;       // volume
}

class DatabentoAdapter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions = new Set<string>();

  connect() {
    this.ws = new WebSocket(DATABENTO_WS, {
      headers: { 'Authorization': `Bearer ${DATABENTO_API_KEY}` }
    });

    this.ws.on('open', () => {
      logger.info('Databento WS connected');
      // Re-subscribe to all pending symbols
      this.subscriptions.forEach(sym => this.subscribe(sym));
    });

    this.ws.on('message', (data: Buffer) => {
      const msg = this.decodeDbn(data); // decode binary DBN → JSON
      this.onMessage(msg);
    });

    this.ws.on('close', () => {
      logger.warn('Databento WS closed — reconnecting in 5s');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('Databento WS error', { message: err.message });
    });
  }

  subscribe(symbol: string) {
    this.subscriptions.add(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        schema: 'mbo',        // market-by-order (or 'mbp-1' for best bid/ask)
        stype_in: 'raw_symbol',
        symbols: [symbol],
      }));
    }
  }

  private decodeDbn(buf: Buffer): DatabentoQuote {
    // Databento sends DBN binary → use @databento/dbn package
    // Simplified placeholder:
    return JSON.parse(buf.toString());
  }

  private onMessage(msg: DatabentoQuote) {
    // Push to Redis + internal event bus
    normalizeAndCache(msg);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export const databento = new DatabentoAdapter();
```

---

### 3.2 Normalizer + Redis Cache (`src/services/cache.ts`)

```typescript
import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface NormalizedQuote {
  ticker: string;
  price: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume: number;
  timestamp: number; // ms epoch
}

export interface NormalizedFundamentals {
  ticker: string;
  pe?: number;
  pb?: number;
  marketCap?: number;
  dividendYield?: number;
  // ... matches Yahoo Finance shape for drop-in replacement
}

const TTL = {
  quote: 5,          // seconds
  fundamentals: 3600, // 1 hour
  history: 900,       // 15 minutes
};

export async function cacheQuote(q: NormalizedQuote) {
  const key = `stock:${q.ticker}:quote`;
  await redis.setex(key, TTL.quote, JSON.stringify(q));
}

export async function getCachedQuote(ticker: string): Promise<NormalizedQuote | null> {
  const raw = await redis.get(`stock:${ticker}:quote`);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheFundamentals(ticker: string, data: NormalizedFundamentals) {
  const key = `stock:${ticker}:fundamentals`;
  await redis.setex(key, TTL.fundamentals, JSON.stringify(data));
}

export async function getCachedFundamentals(ticker: string): Promise<NormalizedFundamentals | null> {
  const raw = await redis.get(`stock:${ticker}:fundamentals`);
  return raw ? JSON.parse(raw) : null;
}

// ---- Normalizer ----

import type { DatabentoQuote } from '../api/databento';

export function normalizeAndCache(raw: DatabentoQuote) {
  const normalized: NormalizedQuote = {
    ticker: raw.symbol,
    price: raw.px,
    bid: raw.bid,
    ask: raw.ask,
    bidSize: raw.bs,
    askSize: raw.as,
    volume: raw.vol,
    timestamp: Math.floor(raw.ts / 1_000_000), // ns → ms
  };
  cacheQuote(normalized).catch(err =>
    logger.error('Redis cacheQuote failed', { ticker: raw.symbol, error: err.message })
  );
}
```

---

### 3.3 Plug Into Existing Scoring Service

The current `scoring.ts` fetches from Yahoo Finance. Add a **cache-first** read so Databento data is preferred:

```typescript
// src/services/scoring.ts (additive change)
import { getCachedQuote, getCachedFundamentals } from './cache';
import { yahooFallback } from '../api/yahoo'; // existing

async function getStockData(ticker: string) {
  // 1. Try Redis (Databento live feed)
  const [quote, fundamentals] = await Promise.all([
    getCachedQuote(ticker),
    getCachedFundamentals(ticker),
  ]);

  if (quote) {
    return { source: 'databento', quote, fundamentals };
  }

  // 2. Fallback to Yahoo Finance / FMP
  return yahooFallback(ticker);
}
```

---

## 4. Redis Schema Design

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `stock:AAPL:quote` | JSON `{price,bid,ask,volume,timestamp}` | 5s | Live best bid/ask |
| `stock:AAPL:fundamentals` | JSON `{pe,pb,marketCap,...}` | 1h | Slow-moving metrics |
| `stock:AAPL:history:1d` | JSON `[{date,close,high,low,vol},...]` | 15m | Chart / RSI / momentum |
| `stock:AAPL:options:chain` | JSON `{expirations:[...],strikes:[...]}` | 60s | Options analytics (OPRA) |
| `user:{tgId}:weights` | Hash `{valuation:75,...}` | ∞ | SQLite mirror (hot cache) |
| `alerts:active` | Set `[alertId:1, alertId:2]` | ∞ | Fast alert polling |

---

## 5. Deployment Topology (Render + Upstash)

```
┌─────────────────────────────────────────┐
│           Render Cloud (Oregon)         │
│                                         │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  stockwise- │    │  Redis (Upstash)│  │
│  │  pro-bot    │◄──►│  • 10k ops/s   │  │
│  │  (Docker)   │    │  • TLS enabled │  │
│  │             │    │  • persistence │  │
│  └─────────────┘    └────────────────┘  │
│         │                               │
│         │ WebSocket                     │
│         ▼                               │
│  ┌─────────────────────────────────┐    │
│  │  Databento API (Internet)       │    │
│  │  wss://hist.databento.com/...   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Environment Variables to Add

```bash
DATABENTO_API_KEY=db-xxxxxxxxxxxxxxxx
DATABENTO_WS_URL=wss://hist.databento.com/v0/stream
REDIS_URL=rediss://default:xxxxxxxx@upstash-host:6379
```

---

## 6. Fallback Strategy

```text
┌─────────────┐     miss     ┌─────────────┐     miss     ┌─────────────┐
│   Redis     │─────────────►│   Yahoo /   │─────────────►│  Safe Error │
│  (Databento)│              │    FMP      │              │   Message   │
└─────────────┘              └─────────────┘              └─────────────┘
     │                            │
     └──────── hit ───────────────┘
            fast path
```

- **Cache hit (< 5s old):** sub-millisecond reply → best UX
- **Cache miss:** Yahoo Finance fallback (≈ 500ms–2s) → acceptable
- **Total failure:** user-safe error message

---

## 7. Cost Estimate (Databento)

| Tier | What You Get | Monthly Cost |
|------|-------------|--------------|
| **Free** (trial) | 25 GB historical + limited live | $0 |
| **Starter** | Pay-as-you-go per GB | ~$25–100 |
| **Growth** | Discounted bulk + OPRA | ~$500–1,500 |
| **Enterprise** | Custom SLA + dedicated line | $5,000+ |

For a single-bot workload (~100 symbols, quotes only): **Starter tier is plenty**.

---

## 8. Next Steps to Implement

1. **Sign up** at [databento.com](https://databento.com) → grab API key
2. **Add `@databento/dbn`** decoder package to `package.json`
3. **Create** `src/api/databento.ts` adapter (sketch above)
4. **Provision** Upstash Redis (free tier) on Render marketplace
5. **Create** `src/services/cache.ts` normalizer + Redis writer
6. **Wire** `scoring.ts` to read Redis first, Yahoo second
7. **Add** `DATABENTO_API_KEY` and `REDIS_URL` to Render env vars
8. **Deploy** → monitor WS connection health in logs

---

*Document version: 2026-04-25*
*Author: OpenBox dev session*

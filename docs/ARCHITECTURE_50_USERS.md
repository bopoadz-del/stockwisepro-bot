# OpenBox Architecture — 50 Users

> Practical, single-node architecture. No Kubernetes, no microservices, no Kafka. Just a solid Node.js bot with Redis caching and Databento data.

---

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Hosting** | Render (Docker Worker) | $7–15/mo, auto-deploy from Git, managed |
| **Bot** | Node.js + Telegraf | Already working, single process |
| **Cache** | Upstash Redis (free tier) | 10k commands/day, TLS, zero maintenance |
| **Database** | SQLite (WAL mode) | File-based, zero ops, handles 50 users fine |
| **Market Data** | Databento HTTP + Yahoo Finance fallback | Databento for live prices, Yahoo for fundamentals |
| **Local Dev** | Docker Compose | Bot + Redis in one command |

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│              Telegram Cloud             │
│         (user messages in)              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         Render Cloud (Oregon)           │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  stockwisepro-bot (Docker)      │    │
│  │  • Node.js + Telegraf           │    │
│  │  • SQLite (./data/bot.db)       │    │
│  │  • In-memory cache fallback     │    │
│  └─────────────┬───────────────────┘    │
│                │                        │
│         ┌──────┴──────┐                 │
│         ▼             ▼                 │
│  ┌──────────┐   ┌──────────────┐       │
│  │ Upstash  │   │ Databento    │       │
│  │ Redis    │   │ HTTP API     │       │
│  │ (TLS)    │   │ (live trades)│       │
│  └──────────┘   └──────────────┘       │
│                                         │
│  Fallback: Yahoo Finance v2             │
└─────────────────────────────────────────┘
```

---

## Data Flow

```
User: /score AAPL

1. Bot checks Redis cache
   ├─ hit (< 5 min old) → instant reply
   └─ miss → continue

2. Bot fetches live price from Databento
   ├─ success → cache to Redis, continue
   └─ fail → use Yahoo Finance price

3. Bot fetches fundamentals from Yahoo Finance
   ├─ success → cache to Redis (1h TTL)
   └─ fail → use cached or neutral defaults

4. Bot computes score (valuation, profitability, etc.)

5. Bot replies to user
```

---

## Why This Works for 50 Users

| Concern | Reality | Solution |
|---------|---------|----------|
| **Concurrent writes** | 50 users ≠ 50 simultaneous DB writes | SQLite WAL mode + error-resilient logging |
| **Rate limits** | Yahoo Finance: ~2,000/hr | Redis cache (5s TTL for quotes, 1h for fundamentals) |
| **Latency** | Users expect < 2s replies | Cache-first = sub-100ms for repeated tickers |
| **Uptime** | Render auto-restarts on crash | Health check endpoint + `restart: unless-stopped` |
| **Cost** | Budget likely <$50/mo | Render Standard ($7) + Upstash Free ($0) + Databento ($0–25) |

---

## Redis Schema

| Key | TTL | Value |
|-----|-----|-------|
| `stock:AAPL:quote` | 5s | `{price, bid, ask, timestamp}` |
| `stock:AAPL:fundamentals` | 1h | `{pe, pb, roe, margin, ...}` |
| `stock:AAPL:history:1d` | 15m | `[{date, close, high, low, vol}]` |

---

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=8030061746:AAGYUJR_jABPTTjrHMLPVm1CO7Y_nLPSu5U

# Optional but recommended
DATABENTO_API_KEY=db-xxxxxxxxxxxxxxxx
REDIS_URL=rediss://default:xxx@upstash-host:6379

# Bot config
STOCKWISE_API_BASE_URL=https://stockwise-pro-api.onrender.com
BRAVE_API_KEY=your_brave_key
DATA_DIR=./data
```

---

## Local Development

```bash
# Start bot + Redis
docker-compose up -d

# View logs
docker-compose logs -f bot

# Redis CLI
docker-compose exec redis redis-cli
```

---

## When to Upgrade

| Trigger | Upgrade To |
|---------|-----------|
| 200+ active users | Render Pro + Upstash Paid ($10) |
| SQLite corruption/locks | Render PostgreSQL ($7) |
| Real-time tick streaming | Databento WebSocket (when Node SDK drops) |
| Multiple services (web app, API, bot) | Then consider Docker Compose or K8s |

---

## What We Skipped (And Why)

| Skipped | Reason |
|---------|--------|
| Kubernetes | 1 service, 1 developer, 50 users |
| Kafka | No event streaming volume |
| Microservices | No team to maintain them |
| PostgreSQL | SQLite WAL handles 50 users |
| Grafana/Prometheus | Render dashboard is enough |

---

*Document version: 2026-04-26*

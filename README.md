# StockWiseBot 🤖📈

Telegram bot for [StockWisePro / AlphaSpectrum](https://github.com/bopoadz-del/StockWisePro). Built for experimental research with ~50 users to validate AI scoring accuracy, collect interaction analytics, and iterate toward a paid product.

---

## 🚀 Features

- **Stock Research** — Search and score stocks via your existing StockWisePro API
- **Portfolio & Watchlist** — View, add, remove holdings directly from Telegram
- **Investor Mimicry** — Copy strategies from Buffett, Dalio, Wood, Lynch, Graham, Templeton
- **Experiment Workspace** — Run custom scoring formulas and backtests
- **Price Alerts** — Background cron checks prices and notifies users
- **Live Score Feed** — Rotates an S&P-500-class ticker every minute, scores it, records the time-series, and pushes big-move alerts
- **Bilingual (EN / AR)** — Full English + Arabic on the bot and the web app, with RTL support
- **Frictionless Profiles** — Email-only sign-in (no password, no confirmation) shared between Telegram and the website
- **Rich Analytics** — SQLite-backed logging of every command, ticker, API latency, and user feedback
- **Admin Dashboard** — Export CSV analytics and view usage summaries
- **Redeployable** — Dockerized, env-driven, portable SQLite database

---

## 🏗️ Architecture

```
┌──────────────┐      REST API       ┌──────────────────┐
│  Telegram    │ ◄────────────────► │  StockWisePro    │
│   Users      │                     │   Backend        │
└──────────────┘                     └──────────────────┘
       │
       ▼
┌──────────────┐
│ StockWiseBot │  (Node.js + Telegraf + SQLite)
│  - Commands  │
│  - Analytics │
│  - Alerts    │
└──────────────┘
```

---

## 📦 Tech Stack

- **Node.js 20** + TypeScript
- **Telegraf** — Telegram bot framework
- **better-sqlite3** — Local analytics & user storage
- **Axios** — StockWisePro API client
- **node-cron** — Price alert scheduler
- **Docker** — One-command deployment

---

## ⚡ Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/stockwisepro-bot.git
cd stockwisepro-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather
STOCKWISE_API_BASE_URL=https://your-api.com
STOCKWISE_API_KEY=optional
BOT_ADMIN_TELEGRAM_IDS=123456789
DATA_DIR=./data
ALERT_CHECK_INTERVAL_MINUTES=5

# Public website URL — shown as a button in /start and /profile, and the
# target of the Telegram → web auto-login link
WEBSITE_URL=https://your-app.onrender.com
# Signs the Telegram→web auto-login token (falls back to SESSION_SECRET)
JWT_SECRET=change-me-to-a-random-string
SESSION_SECRET=change-me-to-a-random-string
# Live score feed / market data + news headlines
FMP_API_KEY=optional_financial_modeling_prep_key
BRAVE_API_KEY=optional_brave_search_key
```

### 3. Run

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

**Docker:**
```bash
docker-compose up --build -d
```

---

## 🤖 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome & register user |
| `/search <ticker>` | Search stocks |
| `/score <ticker>` | AI scoring + feedback buttons |
| `/watchlist` | View watchlist |
| `/watchlist_add <ticker>` | Add to watchlist |
| `/watchlist_remove <id>` | Remove from watchlist |
| `/portfolio` | View portfolio |
| `/mimic` | Copy investor strategy (inline menu) |
| `/experiment <formula>` | Run custom scoring formula |
| `/alert <ticker> <above\|below> <price>` | Set price alert |
| `/alerts` | View your alerts |
| `/marketalerts` | Toggle big market-move push alerts |
| `/insights [ticker]` | Market insights & score signal-accuracy |
| `/explain <ticker>` | AI explanation of a ticker (needs Ollama) |
| `/admin` | Usage stats (admin only) |
| `/admin_export` | Download CSV analytics (admin only) |
| `/admin_export_scores` | Download live score-history dataset CSV (admin only) |
| `/profile` | View or set your profile (email — no password) |
| `/language` | Switch language (English / العربية) |
| `/help` | Show help |

---

## 🌐 Localization (Arabic / English)

Both the Telegram bot and the web app ship with full **English + Arabic** support.

- **Bot** — Users pick a language with `/language` (or `/lang`). The choice is stored
  per-user in the `users.language` column and applied to every reply. Translations live
  in `src/i18n/`.
- **Web** — A language toggle in the navbar switches between English and Arabic. Arabic
  flips the entire UI to **RTL** (`dir="rtl"`) and loads an Arabic-friendly font. The
  selection persists in `localStorage` and is auto-detected from the browser locale on
  first visit. Translations live in `web/src/i18n/translations.ts`, wired through
  `web/src/contexts/LanguageContext.tsx`.

---

## 👤 Profiles & Sign-in

Frictionless, email-only profiles shared between the bot and the website — **no password,
no confirmation, no verification**.

- **Bot** — A profile is auto-created on `/start`. `/profile` shows your email, language,
  and alert status; `/profile you@email.com` sets your email. No confirmation step.
- **Web** — The auth modal asks for an email (and optional name) only. `POST /api/auth/email`
  upserts a `web_users` row (with no usable password) and starts the session.
- **Telegram → Web auto-login** — Starting the bot links a web profile (`web_users.telegram_id`).
  The `/start` and `/profile` **Visit Website** buttons carry a short-lived signed JWT
  (`?tg=<token>`); the site redeems it via `POST /api/auth/telegram`, opening a session for
  the **same profile**, then strips the token from the URL. The token is signed with
  `JWT_SECRET` (falls back to `SESSION_SECRET`) — the bot and web run in one process.

> ⚠️ **Security note:** by design there is no verification anywhere, so anyone with a
> profile's email or link token can sign in as that profile. This suits the ~50-user
> experiment; add magic-link/OTP and short token expiry before a wider launch.

---

## 📡 Live Score Feed & Market Alerts

A `node-cron` job (`src/services/livefeed.ts`) rotates to a new S&P-500-class ticker every
minute, computes its OpenBox score + live quote, and:

- **Records** a snapshot to the `score_history` table — the growing time-series that seeds
  future RAG/ML work. Export it with `/admin_export_scores` or `GET /api/live/history`.
- **Raises alerts** on big price moves — `notable` (≥3%), `big` (≥6%), `extreme` (≥10%),
  enriched with a Brave news headline for big/extreme. Stored in `market_alerts`.
- **Pushes** big/extreme moves to Telegram users who opted in via `/marketalerts` (localized).

On the website, the hero card is a **live rotating score bubble** (colored by band, animated
pillar bars) and a **floating alert bubble** (gold/green/red by severity) — both poll
`GET /api/live/feed`.

Live data needs `FMP_API_KEY` (Yahoo is the fallback) and `BRAVE_API_KEY` for headlines.

### Insights (Phase 4 — RAG/ML foundation)

`src/services/insights.ts` turns the accumulating dataset into answers, with no
external model required:

- **Signal accuracy** — for each ticker's time-ordered snapshots, it checks whether
  a `buy` score (≥70) preceded a price rise and a `sell` score (<45) preceded a drop,
  reporting an overall hit-rate. This directly measures *does the score predict moves?*
- **Movers** — top score gainers/drops and the most-alerted tickers.
- **Per-ticker context pack** — samples, score range/avg/trend, latest reading, and
  recent alerts — the exact substrate a future LLM (RAG) generation step would consume.

Exposed via `/insights [ticker]` on the bot, `GET /api/live/insights[?ticker=AAPL]`, and the
**Market Insights** section on the website (after the market overview).
The engine degrades gracefully while data is thin and sharpens as `score_history` grows.

#### AI explanations (optional, via Ollama)

The per-ticker context pack can be turned into a natural-language explanation by a **local
[Ollama](https://ollama.com) server** — free, self-hosted, no per-token cost. Set `OLLAMA_URL`
(e.g. `http://your-box:11434`) and optionally `OLLAMA_MODEL` (default `llama3.1`), then use
`/explain <ticker>`. When `OLLAMA_URL` is unset or unreachable, the bot simply falls back to the
deterministic `/insights` output. Ollama needs a real host (RAM/GPU) — run it on your own
machine, not the small Render worker.

> **Roadmap:** once `score_history` is rich, a training/fine-tuning lab (e.g. Tinker) can fit a
> price-move model on the CSV export (`/admin_export_scores`). For the tabular score→move task a
> classic gradient-boosted model is the better fit; reserve LLM fine-tuning for language tasks.

---

## 📊 Analytics

Every interaction is stored in `data/bot_analytics.db`:

- **users** — Telegram ID, username, join date
- **analytics_events** — Command, ticker, input, API latency, success/error
- **feedback** — Thumbs up/down on scores
- **price_alerts** — Active and triggered alerts

### Exporting Data

Admins can run `/admin_export` in Telegram to get a CSV, or query directly:

```bash
sqlite3 data/bot_analytics.db \
  "SELECT command, COUNT(*) FROM analytics_events GROUP BY command;"
```

---

## 🔄 Redeployment Checklist

1. `git clone` this repo
2. `cp .env.example .env` and fill in new tokens/URLs
3. `docker-compose up --build -d`
4. Done. Analytics database is local to the container/host.

---

## 🛣️ Roadmap

- [ ] Full multi-step wizard scenes for complex flows
- [ ] Two-way sync with StockWisePro user accounts (JWT linking)
- [ ] A/B testing different scoring algorithms
- [ ] Payment integration for premium alerts
- [ ] Migrate SQLite → PostgreSQL when scaling beyond 1k users

---

## 📝 License

MIT

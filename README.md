# StockWiseBot 🤖📈

Telegram bot for [StockWisePro / AlphaSpectrum](https://github.com/bopoadz-del/StockWisePro). Built for experimental research with ~50 users to validate AI scoring accuracy, collect interaction analytics, and iterate toward a paid product.

---

## 🚀 Features

- **Stock Research** — Search and score stocks via your existing StockWisePro API
- **Portfolio & Watchlist** — View, add, remove holdings directly from Telegram
- **Investor Mimicry** — Copy strategies from Buffett, Dalio, Wood, Lynch, Graham, Templeton
- **Experiment Workspace** — Run custom scoring formulas and backtests
- **Price Alerts** — Background cron checks prices and notifies users
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
| `/admin` | Usage stats (admin only) |
| `/admin_export` | Download CSV analytics (admin only) |
| `/admin_export_scores` | Download live score-history dataset CSV (admin only) |
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

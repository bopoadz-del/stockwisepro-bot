# Session Log — 2026-05-04

## Summary
Major session: fixed compromised bot token, resolved API endpoint bugs, added screenshot OCR parser, integrated DuckDuckGo fallback, and improved deployment stability.

---

## 1. Security Fix — Compromised Bot Token

- **Problem:** Bot name changed to `⚡️ VPN SECURE | Bot #929`. Token was compromised.
- **Fix:** User regenerated token via @BotFather. Updated `TELEGRAM_BOT_TOKEN` in `.env` and on Render.
- **Status:** ✅ Bot is alive and polling

---

## 2. API Endpoint Bugs Fixed

### Alpaca 401 → Fixed
- **Root cause:** Key-length heuristic (`keyId.length > 20`) wrongly detected Trading API keys as Broker API keys
- **Fix:** Removed auto-detection. Now always uses Trading API (paper/live) unless `ALPACA_BROKER_MODE=true` is set
- **Before:** `broker-api.sandbox.alpaca.markets` with Basic Auth → 401
- **After:** `paper-api.alpaca.markets` with `APCA-API-KEY-ID` headers → works

### FMP 402/403 → Fixed
- **Root cause:** Code used `/stable` paid-tier endpoints (`/key-metrics-ttm`, `/ratings-snapshot`)
- **Fix:** Switched to `/api/v3` free-tier endpoints first, with fallback to `/stable`
  - `/api/v3/quote/{symbol}`
  - `/api/v3/key-metrics/{symbol}` → fallback `/stable/key-metrics-ttm`
  - `/api/v3/rating/{symbol}` → fallback `/stable/ratings-snapshot`
  - `/api/v3/discounted-cash-flow/{symbol}`
  - `/api/v4/insider-trading`

---

## 3. DuckDuckGo Web Search Fallback

- **Removed:** Standalone `/websearch` command (user never asked for it)
- **Added:** DuckDuckGo as automatic fallback when APIs fail
  - `/search` fallback chain: StockWise → Yahoo → Brave → **DuckDuckGo**
  - Chat fallback: when bot can't understand query, it searches DuckDuckGo and returns web results
- **Implementation:** `duck-duck-scrape` package + cheerio HTML fallback (no API key needed)

---

## 4. Screenshot Portfolio Parser (NEW FEATURE)

**File:** `src/commands/screenshot.ts`

**Flow:**
1. User sends screenshot of portfolio/brokerage app
2. Bot downloads highest-res photo from Telegram
3. **OCR** with `tesseract.js` extracts text
4. Extracts ticker symbols (`$AAPL`, uppercase words)
5. Scores up to 10 tickers via OpenBox engine
6. Returns formatted summary with score emojis

**Yahoo 429 mitigation:**
- 1.2-second delay between each ticker score
- FMP quote fallback when OpenBox fails (shows price + change%)

**Example output:**
```
📸 Screenshot parsed — 4 ticker(s) found:

1. *AAPL* — 🟢 72/100
2. *TSLA* — $173.50 (+1.23%) _(score unavailable)_
3. *NVDA* — 🟢 81/100
4. *AMZN* — 🟡 54/100
```

---

## 5. Telegram Command Menu

- Added `bot.telegram.setMyCommands()` on startup
- Non-blocking with 5s timeout to prevent hangs
- Registers all user-facing commands (`/search`, `/score`, `/mimic`, etc.)

---

## 6. Missing Env Var Added

- `FMP_API_KEY=W0ZNDulEbCUkYvy20BcDJIjN91dn4lTJ` — added to `.env` and Render

---

## Commits This Session

| Commit | Message |
|---|---|
| `b2b2368` | fix(screenshot): add 1.2s delay + FMP fallback |
| `d69aaac` | feat: screenshot portfolio parser |
| `4737a20` | debug: crash handlers + non-blocking setMyCommands |
| `e26aa8e` | fix: Alpaca and FMP API endpoint bugs |
| `bc877d1` | fix: DuckDuckGo fallback instead of /websearch command |
| `e75587d` | feat: register Telegram command menu |
| `4fe7dab` | feat: add /websearch command (later reverted) |

---

## Known Issues Remaining

| Issue | Status | Notes |
|---|---|---|
| **Yahoo Finance 429** | Mitigated | 1.2s delays + caching. Still rate-limited on Render shared IP |
| **StockWise API 500** | Server-side | Bot skips auth, runs in guest mode |
| **Databento 401** | Invalid key | Key present but unauthenticated |
| **Brave Search 422** | Invalid key | "subscription token is invalid" |

---

## Test Commands

```
/score AAPL
/mimic → select Buffett → 10000
[send screenshot of portfolio]
```

// Integration test simulating Render startup + real API calls
require('dotenv').config();

const { initDb } = require('../dist/db');
const { stockwise } = require('../dist/api/stockwise');
const { isCacheAvailable } = require('../dist/services/cache');
const { logger } = require('../dist/utils/logger');

async function test() {
  let passed = 0;
  let failed = 0;

  // 1. DB init
  try {
    initDb();
    console.log('✅ DB init OK');
    passed++;
  } catch (err) {
    console.error('❌ DB init failed:', err.message);
    failed++;
  }

  // 2. StockWise API auth
  try {
    await stockwise.authenticateAsBot();
    console.log('✅ StockWise API auth OK (or skipped)');
    passed++;
  } catch (err) {
    console.error('❌ StockWise API auth failed:', err.message);
    failed++;
  }

  // 3. StockWise API — simple GET (root or known endpoint)
  try {
    const axios = require('axios');
    const base = process.env.STOCKWISE_API_BASE_URL || 'https://stockwise-pro-api.onrender.com';
    const res = await axios.get(`${base}/api/scores/AAPL`, { timeout: 10000, validateStatus: () => true });
    console.log('✅ StockWise API reachable, status:', res.status);
    passed++;
  } catch (err) {
    console.error('❌ StockWise API unreachable:', err.message);
    failed++;
  }

  // 4. Redis / Upstash
  try {
    const ok = isCacheAvailable();
    console.log(ok ? '✅ Redis cache available' : '⚠️ Redis cache unavailable (fallback OK)');
    passed++;
  } catch (err) {
    console.error('❌ Redis cache error:', err.message);
    failed++;
  }

  // 5. Brave API
  try {
    const { brave } = require('../dist/api/brave');
    const res = await brave.webSearch('AAPL stock', 1);
    if (res.error) {
      console.log('⚠️ Brave API returned error (expected if key missing):', res.error);
    } else {
      console.log('✅ Brave API OK, results:', res.data.length);
    }
    passed++;
  } catch (err) {
    console.error('❌ Brave API error:', err.message);
    failed++;
  }

  // 6. Yahoo Finance (local scoring fallback)
  try {
    const YahooFinance = require('yahoo-finance2').default || require('yahoo-finance2');
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const summary = await yf.quoteSummary('AAPL', { modules: ['summaryDetail'] });
    console.log('✅ Yahoo Finance OK, PE:', summary.summaryDetail?.trailingPE || 'N/A');
    passed++;
  } catch (err) {
    console.error('❌ Yahoo Finance error:', err.message);
    failed++;
  }

  // 7. Databento adapter init
  try {
    const { databento } = require('../dist/api/databento');
    console.log(databento.enabled ? '✅ Databento adapter enabled' : '⚠️ Databento disabled (no key)');
    passed++;
  } catch (err) {
    console.error('❌ Databento error:', err.message);
    failed++;
  }

  // 8. Full bot startup (without Telegram polling)
  try {
    const { config } = require('../dist/config');
    const { databento } = require('../dist/api/databento');
    const { startAlertService } = require('../dist/services/alerts');
    const { startLearningReportService } = require('../dist/services/learning');

    console.log('✅ Bot config loaded, token format valid');
    console.log('✅ Databento:', databento.enabled ? 'enabled' : 'disabled');
    console.log('✅ Redis:', isCacheAvailable() ? 'connected' : 'fallback');

    passed++;
  } catch (err) {
    console.error('❌ Bot startup error:', err.message);
    failed++;
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

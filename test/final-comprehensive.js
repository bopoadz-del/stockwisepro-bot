// Comprehensive final test inside Render-like Docker container
require('dotenv').config();

const assert = require('assert');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return fn()
      .then(() => { console.log(`✅ ${name}`); passed++; })
      .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
  }

  // 1. DB
  await test('DB initializes and migrations run', async () => {
    const { initDb } = require('../dist/db');
    initDb();
  });

  // 2. better-sqlite3 native module
  await test('better-sqlite3 native module loads', async () => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.prepare('SELECT 1 as ok').get();
    db.close();
  });

  // 3. Redis/Upstash
  await test('Redis cache client initializes', async () => {
    const { isCacheAvailable } = require('../dist/services/cache');
    // May be unavailable if env vars missing, but should not crash
    isCacheAvailable();
  });

  // 4. Databento adapter
  await test('Databento adapter loads without crash', async () => {
    const { databento } = require('../dist/api/databento');
    assert(typeof databento.enabled === 'boolean');
  });

  // 5. Health endpoint
  await test('Health server responds', async () => {
    const http = require('http');
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/health', (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          const json = JSON.parse(data);
          assert(json.status === 'ok');
          resolve(undefined);
        });
      });
      req.on('error', reject);
      // Timeout in case server isn't running
      setTimeout(() => reject(new Error('Health timeout')), 3000);
    });
  });

  // 6. Local mimic API endpoint
  await test('POST /api/portfolio/mimic returns portfolio', async () => {
    const http = require('http');
    const payload = JSON.stringify({ investorId: 'buffett', ethicsEnabled: true });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/portfolio/mimic',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, resolve);
      req.on('error', reject);
      req.write(payload);
      req.end();
      setTimeout(() => reject(new Error('Mimic API timeout')), 5000);
    });
    let data = '';
    res.on('data', c => data += c);
    await new Promise(r => res.on('end', r));
    const json = JSON.parse(data);
    assert(Array.isArray(json.holdings) && json.holdings.length > 0, 'Expected holdings array');
    assert(json.investorName, 'Expected investorName');
  });

  // 7. OpenBox score engine
  await test('OpenBox score engine computes AAPL', async () => {
    const { computeOpenBoxScore } = require('../dist/services/openbox/engine');
    const result = await computeOpenBoxScore('AAPL');
    assert(result, 'Expected score result');
    assert(typeof result.finalScore === 'number');
    assert(result.finalScore >= 0 && result.finalScore <= 100);
  });

  // 8. Score command full path
  await test('/score command produces formatted message', async () => {
    const { scoreCommand } = require('../dist/commands/score');
    let received = '';
    const ctx = {
      message: { text: '/score MSFT' },
      from: { id: 123456 },
      replyWithChatAction: async () => {},
      reply: async () => {},
      replyWithMarkdown: async (msg) => { received = msg; },
      state: {},
    };
    await scoreCommand(ctx);
    assert(received.includes('OPENBOX SCORE: MSFT'), 'Expected score header');
    assert(received.includes('/100'), 'Expected score value');
  });

  // 9. Mimic portfolio for congress trader
  await test('Mimic works for congress:pelosi', async () => {
    const { getLocalMimicAllocation } = require('../dist/services/mimic');
    const result = getLocalMimicAllocation('congress:pelosi', false);
    assert(result, 'Expected mimic result');
    assert(result.holdings.length > 0);
  });

  // 10. Sheet engine loads investor_sheet.json
  await test('Sheet engine loads and builds Buffett portfolio', async () => {
    const { buildPortfolioFromSheet } = require('../dist/services/sheet_engine');
    const result = buildPortfolioFromSheet('buffett', true);
    assert(result, 'Expected sheet portfolio');
    assert(result.holdings.length > 0);
  });

  // 11. StockWise API client auth attempt (graceful failure)
  await test('StockWise API auth fails gracefully without credentials', async () => {
    const { stockwise } = require('../dist/api/stockwise');
    const ok = await stockwise.authenticateAsBot();
    assert(ok === false, 'Expected false when no credentials');
  });

  // 12. Config validation
  await test('Config loads and validates token format', async () => {
    const { config } = require('../dist/config');
    assert(config.telegramToken, 'Expected telegram token');
    assert(config.healthPort > 0);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

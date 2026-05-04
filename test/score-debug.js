// Deep debug of scoring system inside Render-like container
require('dotenv').config();

const { scoreCommand } = require('../dist/commands/score');
const { computeOpenBoxScore } = require('../dist/services/openbox/engine');
const { stockwise } = require('../dist/api/stockwise');

async function testScore(ticker) {
  console.log(`\n=== Testing /score ${ticker} ===`);
  
  // 1. Test API endpoint
  const apiRes = await stockwise.getStockScore(ticker);
  console.log('API result:', apiRes.error ? `ERROR: ${apiRes.error}` : 'OK');
  
  // 2. Test local OpenBox engine
  const localRes = await computeOpenBoxScore(ticker);
  console.log('Local engine:', localRes ? `Score ${localRes.finalScore}` : 'FAILED');
  
  // 3. Test full command
  const ctx = {
    message: { text: `/score ${ticker}` },
    from: { id: 123456 },
    replyWithChatAction: async () => {},
    reply: async (msg) => console.log('REPLY:', msg.slice(0, 120)),
    replyWithMarkdown: async (msg, markup) => {
      console.log('MARKDOWN:', msg.slice(0, 120));
    },
    state: {},
  };
  
  try {
    await scoreCommand(ctx);
    console.log('Command: SUCCESS');
  } catch (err) {
    console.error('Command: CRASH -', err.message);
  }
}

async function main() {
  await testScore('AAPL');
  await testScore('TSLA');
  await testScore('MSFT');
  await testScore('BTC');
  await testScore('INVALIDXYZ');
  
  console.log('\n=== Checking DB init ===');
  const { initDb } = require('../dist/db');
  try {
    initDb();
    console.log('DB: OK');
  } catch (err) {
    console.error('DB: FAILED -', err.message);
  }
  
  console.log('\n=== Checking Redis ===');
  const { isCacheAvailable } = require('../dist/services/cache');
  console.log('Redis:', isCacheAvailable() ? 'OK' : 'UNAVAILABLE');
  
  console.log('\n=== Checking Databento ===');
  const { databento } = require('../dist/api/databento');
  console.log('Databento:', databento.enabled ? 'OK' : 'DISABLED');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

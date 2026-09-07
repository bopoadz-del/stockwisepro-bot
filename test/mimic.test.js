#!/usr/bin/env node
/**
 * Mimic investor catalog + allocation smoke tests.
 * Run after `npm run build`.
 */

const assert = require('assert');

const {
  getLocalMimicAllocation,
  getHardcodedMimicAllocation,
  allocateMimicBudget,
  MIMIC_INVESTORS,
  MIMIC_INVESTOR_IDS,
  listHardcodedInvestorIds,
} = require('../dist/services/mimic');
const { loadCongressTraders } = require('../dist/services/universe');
const { getInvestorIdsFromSheet } = require('../dist/services/sheet_engine');

function sumPct(holdings) {
  return holdings.reduce((s, h) => s + h.percentage, 0);
}

function assertCompletePortfolio(id, result, label) {
  assert.ok(result, `${label}: expected portfolio for ${id}`);
  assert.ok(result.holdings.length > 0, `${label}: ${id} has empty holdings`);
  const total = sumPct(result.holdings);
  assert.ok(
    Math.abs(total - 100) < 0.6,
    `${label}: ${id} holdings sum to ${total}, expected ~100`
  );
  for (const h of result.holdings) {
    assert.ok(h.ticker && String(h.ticker).trim().length > 0, `${label}: ${id} has blank ticker`);
    assert.ok(h.percentage > 0, `${label}: ${id} ${h.ticker} has non-positive weight`);
  }
}

console.log('🧪 Mimic investor smoke tests\n');

const namedIds = MIMIC_INVESTOR_IDS;
assert.deepStrictEqual(
  namedIds,
  [
    'buffett', 'dalio', 'wood', 'lynch', 'graham', 'templeton',
    'burry', 'ackman', 'soros', 'druckenmiller', 'marks', 'simons', 'icahn',
  ],
  'catalog should list all StockWisePro + Burry investors'
);

const hardcodedIds = listHardcodedInvestorIds();
for (const id of namedIds) {
  assert.ok(hardcodedIds.includes(id), `hardcoded fallback missing ${id}`);
}

console.log('  ✅ menu catalog matches hardcoded fallbacks');

for (const id of namedIds) {
  assertCompletePortfolio(id, getLocalMimicAllocation(id, false), 'local');
  assertCompletePortfolio(id, getHardcodedMimicAllocation(id, false), 'hardcoded');
  const ethical = getLocalMimicAllocation(id, true);
  assertCompletePortfolio(id, ethical, 'ethics');
  assert.strictEqual(ethical.ethicsApplied, true, `${id} ethics flag`);
}
console.log(`  ✅ ${namedIds.length} named investors resolve (~100% weights, ethics on)`);

const congressIds = Object.keys(loadCongressTraders()).map(id => `congress:${id}`);
assert.ok(congressIds.length > 0, 'expected congress traders');
for (const id of congressIds) {
  assertCompletePortfolio(id, getLocalMimicAllocation(id, false), 'congress');
  const ethical = getLocalMimicAllocation(id, true);
  assertCompletePortfolio(id, ethical, 'congress-ethics');
}
console.log(`  ✅ ${congressIds.length} congress traders resolve`);

const unknown = getLocalMimicAllocation('not-a-real-investor', false);
assert.strictEqual(unknown, null, 'unknown id should return null');
assert.strictEqual(getHardcodedMimicAllocation('not-a-real-investor', false), null);
console.log('  ✅ unknown id → null');

const sheetIds = getInvestorIdsFromSheet();
for (const id of namedIds) {
  assert.ok(sheetIds.includes(id), `sheet missing ${id}`);
}
console.log('  ✅ sheet engine lists every named investor');

const replaced = getLocalMimicAllocation('buffett', false, [
  { oldTicker: 'AAPL', newTicker: 'MSFT' },
]);
assert.ok(replaced, 'replacement portfolio');
assert.ok(
  replaced.holdings.some(h => h.ticker.toUpperCase() === 'MSFT'),
  'replacement should include MSFT'
);
assert.ok(
  !replaced.holdings.some(h => h.ticker.toUpperCase() === 'AAPL'),
  'replacement should drop AAPL'
);
assert.ok(
  replaced.replacedTickers && replaced.replacedTickers.some(r => r.old === 'AAPL' && r.new === 'MSFT'),
  'replacement metadata'
);
console.log('  ✅ replacement flow swaps ticker');

const prices = new Map([['AAPL', 200], ['MSFT', 400]]);
const lots = allocateMimicBudget(
  [{ ticker: 'AAPL', percentage: 50 }, { ticker: 'MSFT', percentage: 50 }],
  10000,
  prices
);
assert.strictEqual(lots.holdings[0].shares, 25);
assert.strictEqual(lots.holdings[1].shares, 12);
assert.strictEqual(lots.totalAllocated, 9800);
assert.strictEqual(lots.residualCash, 200);
assert.deepStrictEqual(lots.unquotedTickers, []);

const missing = allocateMimicBudget(
  [{ ticker: 'AAPL', percentage: 50 }, { ticker: 'MSFT', percentage: 50 }],
  10000,
  new Map([['AAPL', 200], ['MSFT', null]])
);
assert.strictEqual(missing.holdings[1].quoted, false);
assert.strictEqual(missing.holdings[1].shares, 0);
assert.strictEqual(missing.residualCash, 5000);
assert.deepStrictEqual(missing.unquotedTickers, ['MSFT']);
console.log('  ✅ allocateMimicBudget residual cash (no invented prices)');

const { mimicCommand } = require('../dist/commands/mimic');
let keyboard;
const ctx = {
  from: { id: 1 },
  state: {},
  replyWithMarkdown: async (_msg, extra) => {
    keyboard = extra;
  },
};
mimicCommand(ctx).then(() => {
  const buttons = keyboard.reply_markup.inline_keyboard.flat();
  const callbackIds = buttons.map(b => b.callback_data.replace('mimic_select:', ''));
  for (const id of namedIds) {
    assert.ok(callbackIds.includes(id), `/mimic menu missing ${id}`);
  }
  for (const id of congressIds) {
    assert.ok(callbackIds.includes(id), `/mimic menu missing ${id}`);
  }
  for (const id of callbackIds) {
    const result = getLocalMimicAllocation(id, false);
    assert.ok(result && result.holdings.length > 0, `dead menu button: ${id}`);
  }
  assert.ok(!callbackIds.includes('unknown'), 'menu should not have unknown ids');
  console.log(`  ✅ /mimic menu has ${callbackIds.length} live buttons (no dead ids)`);
  console.log('\n🎉 Mimic smoke tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});

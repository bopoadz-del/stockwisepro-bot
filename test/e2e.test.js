#!/usr/bin/env node
/**
 * E2E unit tests for all bot commands and fixes
 * Tests run against compiled dist/ files with mock contexts — no Telegram or external API calls.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ─── helpers ────────────────────────────────────────────────────────────────

function makeCtx(text, fromId = 12345) {
  const replies = [];
  const markdownReplies = [];
  const actions = [];
  return {
    from: { id: fromId },
    message: { text },
    state: {},
    reply: async (msg, opts) => { replies.push({ msg, opts }); },
    replyWithMarkdown: async (msg, opts) => { markdownReplies.push({ msg, opts }); },
    replyWithChatAction: async () => {},
    replyWithDocument: async (doc, opts) => { actions.push({ doc, opts }); },
    answerCbQuery: async () => {},
    editMessageReplyMarkup: async () => {},
    _replies: replies,
    _markdownReplies: markdownReplies,
    _actions: actions,
    _allText: () => [...replies.map(r => r.msg), ...markdownReplies.map(r => r.msg)].join('\n'),
  };
}

function lastReply(ctx) {
  const all = [...ctx._replies, ...ctx._markdownReplies];
  return all[all.length - 1]?.msg ?? '';
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✅ ${name}`);
        passed++;
      }).catch(err => {
        console.log(`  ❌ ${name}: ${err.message}`);
        failures.push({ name, err });
        failed++;
      });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
  return Promise.resolve();
}

function section(title) { console.log(`\n── ${title}`); }

// ─── setup DB ───────────────────────────────────────────────────────────────

const tmpDir = path.join(__dirname, `.tmp_e2e_${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DATA_DIR = tmpDir;
process.env.TELEGRAM_BOT_TOKEN = '123456:TESTTESTTESTTESTTESTTESTTESTTESTTEST';
process.env.NODE_ENV = 'test';

const db = require('../dist/db');
db.initDb();
// Pre-register users used across tests so FK constraints pass
[12345, 100, 99, 55555, 66666, 77777, 88888, 11111, 22222].forEach(id => db.ensureUser(id));

// ─── mock stockwise API ──────────────────────────────────────────────────────

const stockwiseModule = require('../dist/api/stockwise');
const sw = stockwiseModule.stockwise;

// ─── 1. WATCHLIST REMOVE — no raw JSON on error ──────────────────────────────

async function runWatchlistTests() {
  section('watchlist_remove: no raw JSON on error');
  const { watchlistRemoveCommand } = require('../dist/commands/watchlist');

  // Patch getWatchlist to simulate API failure
  const orig = sw.getWatchlist;

  await test('shows safe error (not JSON) when API fails during remove', async () => {
    sw.getWatchlist = async () => ({ data: null, duration: 50, error: 'Network error' });
    const ctx = makeCtx('/watchlist_remove AAPL');
    await watchlistRemoveCommand(ctx);
    const reply = lastReply(ctx);
    assert.ok(!reply.includes('{'), 'should not contain raw JSON opening brace');
    assert.ok(!reply.includes('Network error'), 'should not leak internal error message');
    assert.ok(reply.length > 0, 'should reply with something');
  });

  await test('shows "not in watchlist" when ticker not found', async () => {
    sw.getWatchlist = async () => ({ data: [{ id: 1, ticker: 'TSLA' }], duration: 50, error: null });
    const ctx = makeCtx('/watchlist_remove AAPL');
    await watchlistRemoveCommand(ctx);
    const reply = lastReply(ctx);
    assert.ok(reply.includes('AAPL'), 'should mention the ticker');
    assert.ok(!reply.includes('{'), 'should not contain raw JSON');
  });

  sw.getWatchlist = orig;
}

// ─── 2. EXPERIMENT — command flow + formatter ────────────────────────────────

async function runExperimentTests() {
  section('experiment: command flow and result formatting');

  const { experimentCommand, pendingExperiment, runExperimentFromText } = require('../dist/commands/experiment');
  const origRun = sw.runExperiment;

  await test('/experiment sets pending state for user', async () => {
    const ctx = makeCtx('/experiment', 99);
    await experimentCommand(ctx);
    assert.ok(pendingExperiment.has(99), 'user 99 should be in pending set');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('formula'), 'reply should prompt for formula');
    pendingExperiment.delete(99);
  });

  await test('result formatter: string result field', async () => {
    sw.runExperiment = async () => ({ data: { result: '15 stocks matched' }, duration: 100, error: null });
    const ctx = makeCtx('pe_ratio < 20', 100);
    await runExperimentFromText(ctx, 'pe_ratio < 20');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('15 stocks matched'), 'should show string result');
    assert.ok(!reply.includes('"result"'), 'should not show raw JSON key');
  });

  await test('result formatter: object result field', async () => {
    sw.runExperiment = async () => ({ data: { result: { matched: 5, avg_score: 72.5 } }, duration: 100, error: null });
    const ctx = makeCtx('test', 100);
    await runExperimentFromText(ctx, 'test');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('5') || reply.includes('72'), 'should show numeric values');
    assert.ok(!reply.includes('"matched"'), 'should not show raw JSON keys with quotes');
  });

  await test('result formatter: backtest field fallback', async () => {
    sw.runExperiment = async () => ({ data: { backtest: 'Backtest: CAGR 12.3%' }, duration: 100, error: null });
    const ctx = makeCtx('test', 100);
    await runExperimentFromText(ctx, 'test');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('Backtest'), 'should show backtest result');
  });

  await test('result formatter: plain object (no result/backtest) — no raw JSON dump', async () => {
    sw.runExperiment = async () => ({
      data: { formula: 'pe_ratio < 20', matched_tickers: 10, avg_return: 0.15 },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('test', 100);
    await runExperimentFromText(ctx, 'test');
    const reply = lastReply(ctx);
    // Should NOT look like a JSON.stringify dump
    assert.ok(!reply.includes('"formula"'), 'should not have quoted JSON keys');
    assert.ok(!reply.includes('"matched_tickers"'), 'should not have quoted JSON keys');
    // Should have human-readable label
    assert.ok(reply.includes('Avg Return') || reply.includes('Matched') || reply.includes('10'), 'should show formatted values');
  });

  await test('result formatter: null data returns clean fallback', async () => {
    sw.runExperiment = async () => ({ data: null, duration: 100, error: null });
    const ctx = makeCtx('test', 100);
    await runExperimentFromText(ctx, 'test');
    const reply = lastReply(ctx);
    assert.ok(reply.length > 0, 'should reply with something');
    assert.ok(!reply.includes('undefined'), 'should not show "undefined"');
  });

  await test('error path shows safe error message', async () => {
    sw.runExperiment = async () => ({ data: null, duration: 50, error: 'API down' });
    const ctx = makeCtx('test', 100);
    await runExperimentFromText(ctx, 'test');
    const reply = lastReply(ctx);
    assert.ok(!reply.includes('API down'), 'should not leak internal error');
    assert.ok(reply.length > 0, 'should reply with something');
  });

  sw.runExperiment = origRun;
}

// ─── 3. SCORE — OpenBox engine ──────────────────────────────────────────────

async function runScoreTests() {
  section('score: OpenBox engine');

  const { scoreCommand } = require('../dist/commands/score');
  const origGet = sw.getStockScore;

  await test('OpenBox score format shows pillars and narrative', async () => {
    sw.getStockScore = async () => ({
      data: {
        finalScore: 78,
        pillars: {
          fundamentals: 21,
          marketDynamics: 11,
          balanceSheet: 10,
          leadership: 12,
          innovation: 10,
          ethics: 10,
        },
        riskFlags: [],
        narrative: 'Strong fundamentals, strong momentum, safe balance sheet — core holding.',
        ethicsPass: true,
        adjustments: { peerDelta: 2, dominanceBonus: 3 },
      },
      duration: 200,
      error: null,
    });
    const ctx = makeCtx('/score AAPL');
    await scoreCommand(ctx);
    const reply = ctx._allText();
    assert.ok(reply.includes('OPENBOX SCORE'), 'should show OPENBOX header');
    assert.ok(reply.includes('78/100'), 'should show final score');
    // Pillars shown as normalized %
    assert.ok(reply.includes('Fundamentals: 70/100 (weight: 30%)'), 'should show normalized fundamentals');
    assert.ok(reply.includes('Ethics: PASS/10 (weight: 10%)'), 'should show ethics pass');
    assert.ok(reply.includes('NARRATIVE'), 'should show narrative section');
    assert.ok(reply.includes('core holding'), 'should show action');
  });

  await test('ethics block returns early with violation message', async () => {
    sw.getStockScore = async () => ({
      data: {
        finalScore: 0,
        pillars: { fundamentals: 0, marketDynamics: 0, balanceSheet: 0, leadership: 0, innovation: 0, ethics: 0 },
        riskFlags: ['Boycott list: Israeli-linked ticker'],
        narrative: 'Blocked by ethics filter — avoid.',
        ethicsPass: false,
        adjustments: { peerDelta: 0, dominanceBonus: 0 },
      },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/score TEVA');
    await scoreCommand(ctx);
    const reply = ctx._allText();
    assert.ok(reply.includes('ETHICS BLOCK'), 'should show ethics block');
    assert.ok(reply.includes('Boycott list'), 'should show violation');
    assert.ok(!reply.includes('OPENBOX SCORE'), 'should not show score for blocked stock');
  });

  await test('fallback to local OpenBox engine when API returns legacy shape', async () => {
    sw.getStockScore = async () => ({
      data: { ticker: 'MSFT', price: 400, score: 88, metrics: { roe: 0.38472 } },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/score MSFT');
    await scoreCommand(ctx);
    const reply = ctx._allText();
    // Should fall back to computeOpenBoxScore which returns OpenBox format
    assert.ok(reply.includes('OPENBOX SCORE'), 'should show OPENBOX header from local engine');
  });

  await test('missing ticker shows usage hint', async () => {
    const ctx = makeCtx('/score');
    await scoreCommand(ctx);
    const reply = lastReply(ctx);
    assert.ok(reply.includes('Usage'), 'should show usage hint');
  });

  sw.getStockScore = origGet;
}

// ─── 4. PORTFOLIO — no $undefined ────────────────────────────────────────────

async function runPortfolioTests() {
  section('portfolio: no $undefined values');

  const { portfolioCommand } = require('../dist/commands/portfolio');
  const origGet = sw.getPortfolio;

  await test('holding with no price shows ? not $undefined', async () => {
    sw.getPortfolio = async () => ({
      data: {
        holdings: [{ ticker: 'AAPL', shares: 10, currentValue: undefined, currentPrice: undefined, stock: {} }],
        totalValue: undefined,
      },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/portfolio');
    await portfolioCommand(ctx);
    const reply = ctx._allText();
    assert.ok(!reply.includes('$undefined'), 'should not show $undefined');
    assert.ok(!reply.includes('undefined'), 'should not show undefined');
  });

  await test('total value formats with comma for large numbers', async () => {
    sw.getPortfolio = async () => ({
      data: {
        holdings: [{ ticker: 'NVDA', shares: 100, currentValue: 125000.50, currentPrice: 1250 }],
        totalValue: 125000.50,
        pnl: 25000,
      },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/portfolio');
    await portfolioCommand(ctx);
    const reply = ctx._allText();
    assert.ok(reply.includes('125,000') || reply.includes('125000'), 'should show formatted total value');
    assert.ok(!reply.includes('$undefined'), 'should not show $undefined');
  });

  await test('P&L shown with sign', async () => {
    sw.getPortfolio = async () => ({
      data: {
        holdings: [{ ticker: 'SPY', shares: 5, currentValue: 2500 }],
        totalValue: 2500,
        pnl: -150.75,
      },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/portfolio');
    await portfolioCommand(ctx);
    const reply = ctx._allText();
    assert.ok(reply.includes('150') && reply.includes('P&L'), 'should show P&L');
  });

  await test('empty portfolio shows helpful message', async () => {
    sw.getPortfolio = async () => ({
      data: { holdings: [] },
      duration: 100,
      error: null,
    });
    const ctx = makeCtx('/portfolio');
    await portfolioCommand(ctx);
    const reply = lastReply(ctx);
    assert.ok(reply.includes('empty') || reply.includes('mimic'), 'should suggest mimic');
  });

  sw.getPortfolio = origGet;
}

// ─── 5. SIMULATE & METRICS — success flag accuracy ───────────────────────────

async function runSimulateMetricsTests() {
  section('simulate & metrics: success flag accuracy');

  // We can't easily mock the Yahoo API module here (it's bundled),
  // but we can verify the compiled output sets success correctly by
  // checking source patterns.

  await test('simulate.js does not hardcode success:true before fetch', async () => {
    const src = fs.readFileSync('dist/commands/simulate.js', 'utf8');
    // success:true should only appear AFTER the data check
    const successTrueIdx = src.indexOf('success: true');
    const errorCheckIdx = src.indexOf('hist.error');
    assert.ok(successTrueIdx > errorCheckIdx, 'success:true should come after error check');
  });

  await test('simulate.js sets success:false on failed fetch', async () => {
    const src = fs.readFileSync('dist/commands/simulate.js', 'utf8');
    assert.ok(src.includes('success: false'), 'simulate should set success:false on error');
  });

  await test('metrics.js does not hardcode success:true before fetch', async () => {
    const src = fs.readFileSync('dist/commands/metrics.js', 'utf8');
    const successTrueIdx = src.indexOf('success: true');
    const errorCheckIdx = src.indexOf('hist.error');
    assert.ok(successTrueIdx > errorCheckIdx, 'success:true should come after error check');
  });

  await test('metrics.js sets success:false on failed fetch', async () => {
    const src = fs.readFileSync('dist/commands/metrics.js', 'utf8');
    assert.ok(src.includes('success: false'), 'metrics should set success:false on error');
  });

  await test('simulate.js tracks real apiDuration (not hardcoded 0)', async () => {
    const src = fs.readFileSync('dist/commands/simulate.js', 'utf8');
    assert.ok(!src.includes('apiDuration: 0'), 'simulate should not hardcode apiDuration to 0');
    assert.ok(src.includes('apiDuration'), 'simulate should track apiDuration');
  });

  await test('metrics.js tracks real apiDuration (not hardcoded 0)', async () => {
    const src = fs.readFileSync('dist/commands/metrics.js', 'utf8');
    assert.ok(!src.includes('apiDuration: 0'), 'metrics should not hardcode apiDuration to 0');
    assert.ok(src.includes('apiDuration'), 'metrics should track apiDuration');
  });
}

// ─── 6. CHAT HANDLER — experiment pending flow ──────────────────────────────

async function runChatExperimentFlowTests() {
  section('chat handler: experiment pending flow');

  // Re-require fresh to avoid cached state issues
  const { pendingExperiment } = require('../dist/commands/experiment');
  const { handleChatMessage } = require('../dist/commands/chat');
  const origRun = sw.runExperiment;

  await test('message after /experiment goes to experiment handler', async () => {
    let experimentCalled = false;
    let capturedFormula = '';
    sw.runExperiment = async (formula) => {
      experimentCalled = true;
      capturedFormula = formula;
      return { data: { result: 'ok' }, duration: 50, error: null };
    };

    const userId = 55555;
    pendingExperiment.add(userId);

    const ctx = makeCtx('pe_ratio < 20 and roe > 0.15', userId);
    await handleChatMessage(ctx);

    assert.ok(experimentCalled, 'experiment should have been called');
    assert.ok(capturedFormula.includes('pe_ratio'), 'formula should be passed correctly');
    assert.ok(!pendingExperiment.has(userId), 'pending state should be cleared after execution');
  });

  await test('pending state cleared even on experiment error', async () => {
    sw.runExperiment = async () => ({ data: null, duration: 50, error: 'backend down' });

    const userId = 66666;
    pendingExperiment.add(userId);

    const ctx = makeCtx('some formula', userId);
    await handleChatMessage(ctx);

    assert.ok(!pendingExperiment.has(userId), 'pending state should be cleared on error too');
  });

  await test('non-pending user message not treated as experiment', async () => {
    let experimentCalled = false;
    sw.runExperiment = async () => { experimentCalled = true; return { data: { result: 'x' }, duration: 50, error: null }; };

    const ctx = makeCtx('AAPL', 77777);  // ticker-only, not pending
    await handleChatMessage(ctx);

    assert.ok(!experimentCalled, 'experiment should NOT be called for non-pending user');
  });

  await test('exp: prefix still works (backward compat)', async () => {
    let experimentCalled = false;
    sw.runExperiment = async () => { experimentCalled = true; return { data: { result: 'ok' }, duration: 50, error: null }; };

    const ctx = makeCtx('exp: pe_ratio < 10', 88888);
    await handleChatMessage(ctx);

    assert.ok(experimentCalled, 'exp: prefix should still trigger experiment');
  });

  sw.runExperiment = origRun;
}

// ─── 7. NATURAL LANGUAGE — routing sanity ───────────────────────────────────

async function runNLPTests() {
  section('natural language handler: intent routing');

  const { handleChatMessage } = require('../dist/commands/chat');
  const origSearch = sw.searchStocks;
  const origScore = sw.getStockScore;
  const origPort = sw.getPortfolio;
  const origWatch = sw.getWatchlist;

  sw.getStockScore = async () => ({ data: { ticker: 'AAPL', price: 185, score: 80, metrics: {} }, duration: 100, error: null });
  sw.searchStocks = async () => ({ data: [{ ticker: 'AAPL', name: 'Apple', price: 185 }], duration: 100, error: null });
  sw.getPortfolio = async () => ({ data: { holdings: [] }, duration: 100, error: null });
  sw.getWatchlist = async () => ({ data: [], duration: 100, error: null });

  await test('ticker-only message routes to score', async () => {
    let scored = false;
    const orig = sw.getStockScore;
    sw.getStockScore = async () => { scored = true; return { data: { ticker: 'TSLA', price: 250, score: 75, metrics: {} }, duration: 100, error: null }; };
    const ctx = makeCtx('TSLA');
    await handleChatMessage(ctx);
    assert.ok(scored, 'TSLA alone should trigger score');
    sw.getStockScore = orig;
  });

  await test('$TICKER syntax routes to score', async () => {
    let scored = false;
    sw.getStockScore = async () => { scored = true; return { data: { ticker: 'MSFT', price: 400, score: 88, metrics: {} }, duration: 100, error: null }; };
    const ctx = makeCtx('$MSFT');
    await handleChatMessage(ctx);
    assert.ok(scored, '$MSFT should trigger score');
  });

  await test('"portfolio" keyword routes to portfolio', async () => {
    let portfolioHit = false;
    sw.getPortfolio = async () => { portfolioHit = true; return { data: { holdings: [] }, duration: 100, error: null }; };
    const ctx = makeCtx('show my portfolio');
    await handleChatMessage(ctx);
    assert.ok(portfolioHit, '"my portfolio" should route to portfolio');
  });

  await test('"watchlist" keyword routes to watchlist', async () => {
    let watchlistHit = false;
    sw.getWatchlist = async () => { watchlistHit = true; return { data: [], duration: 100, error: null }; };
    const ctx = makeCtx('show my watchlist');
    await handleChatMessage(ctx);
    assert.ok(watchlistHit, '"my watchlist" should route to watchlist');
  });

  await test('unknown message shows fallback with correction buttons', async () => {
    const ctx = makeCtx('blahblah random words xyz qwerty');
    await handleChatMessage(ctx);
    const allText = ctx._allText();
    const allReplies = [...ctx._replies, ...ctx._markdownReplies];
    const hasButtons = allReplies.some(r => r.opts?.reply_markup?.inline_keyboard?.length > 0);
    assert.ok(hasButtons || allText.includes('help'), 'fallback should offer correction buttons or help');
  });

  sw.searchStocks = origSearch;
  sw.getStockScore = origScore;
  sw.getPortfolio = origPort;
  sw.getWatchlist = origWatch;
}

// ─── 8. VALIDATION — ticker sanitization ────────────────────────────────────

async function runValidationTests() {
  section('validation: ticker and input sanitization');

  const { validateTicker, sanitizeTicker } = require('../dist/utils/validation');

  await test('valid tickers pass', () => {
    assert.ok(validateTicker('AAPL'), 'AAPL valid');
    assert.ok(validateTicker('TSLA'), 'TSLA valid');
    assert.ok(validateTicker('BRK.B'), 'BRK.B valid');
    assert.ok(validateTicker('BRK-B'), 'BRK-B valid');
    assert.ok(validateTicker('SPY'), 'SPY valid');
  });

  await test('invalid tickers rejected', () => {
    assert.ok(!validateTicker(''), 'empty string invalid');
    assert.ok(!validateTicker('TOOLONGNAMETHATEXCEEDSLIMIT'), 'too long (>20 chars) invalid');
    assert.ok(!validateTicker('A B'), 'spaces invalid');
    assert.ok(!validateTicker('<script>'), 'HTML injection invalid');
    assert.ok(!validateTicker('TICK@ER'), 'special chars invalid');
  });

  await test('sanitizeTicker strips dangerous chars', () => {
    assert.ok(!sanitizeTicker('<AAPL>').includes('<'), 'no < in output');
    assert.ok(!sanitizeTicker('AAPL;DROP').includes(';'), 'no ; in output');
  });
}

// ─── 9. COMMANDS — argument parsing edge cases ───────────────────────────────

async function runCommandParsingTests() {
  section('commands: argument parsing edge cases');

  const { simulateCommand } = require('../dist/commands/simulate');
  const { metricsCommand } = require('../dist/commands/metrics');
  const { alertCommand } = require('../dist/commands/alert');
  const { watchlistAddCommand, watchlistRemoveCommand } = require('../dist/commands/watchlist');

  await test('simulate rejects days < 1', async () => {
    const ctx = makeCtx('/simulate AAPL 0');
    await simulateCommand(ctx);
    assert.ok(lastReply(ctx).includes('between') || lastReply(ctx).includes('1'), 'should reject 0 days');
  });

  await test('simulate rejects days > 365', async () => {
    const ctx = makeCtx('/simulate AAPL 500');
    await simulateCommand(ctx);
    assert.ok(lastReply(ctx).includes('between') || lastReply(ctx).includes('365'), 'should reject 500 days');
  });

  await test('simulate rejects missing ticker', async () => {
    const ctx = makeCtx('/simulate');
    await simulateCommand(ctx);
    assert.ok(lastReply(ctx).includes('Usage'), 'should show usage');
  });

  await test('metrics rejects missing ticker', async () => {
    const ctx = makeCtx('/metrics');
    await metricsCommand(ctx);
    assert.ok(lastReply(ctx).includes('Usage'), 'should show usage');
  });

  await test('alert rejects missing args', async () => {
    const ctx = makeCtx('/alert');
    await alertCommand(ctx);
    assert.ok(lastReply(ctx).includes('Usage') || lastReply(ctx).includes('alerts'), 'should show usage or list alerts');
  });

  await test('watchlist_add rejects missing ticker', async () => {
    const ctx = makeCtx('/watchlist_add');
    await watchlistAddCommand(ctx);
    assert.ok(lastReply(ctx).includes('Usage'), 'should show usage');
  });

  await test('watchlist_remove rejects missing ticker', async () => {
    const ctx = makeCtx('/watchlist_remove');
    await watchlistRemoveCommand(ctx);
    assert.ok(lastReply(ctx).includes('Usage'), 'should show usage');
  });
}

// ─── 10. MIMIC ─ amount prompt flow ──────────────────────────────────────────

async function runMimicTests() {
  section('mimic: amount prompt flow');

  const { pendingMimic, runMimicFromAmount } = require('../dist/commands/mimic');
  const sw = require('../dist/api/stockwise').stockwise;
  const origMimic = sw.mimicInvestor;

  await test('selecting investor sets pending mimic state', async () => {
    const { handleMimicCallback } = require('../dist/commands/mimic');
    const ctx = makeCtx('/mimic', 33333);
    ctx.match = ['mimic_select:buffett', 'buffett'];
    await handleMimicCallback(ctx);
    assert.ok(pendingMimic.has(33333), 'user should be in pending mimic state');
    assert.strictEqual(pendingMimic.get(33333).investorId, 'buffett');
    pendingMimic.delete(33333);
  });

  await test('valid amount triggers local mimic allocation', async () => {
    pendingMimic.set(44444, { investorId: 'buffett', stage: 'amount', ethicsEnabled: false });
    const ctx = makeCtx('10000', 44444);
    await runMimicFromAmount(ctx, '10000');

    assert.ok(!pendingMimic.has(44444), 'pending state should be cleared');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('Warren Buffett'), 'should mention investor');
    assert.ok(reply.includes('$10,000'), 'should show investment amount');
    assert.ok(reply.includes('AAPL'), 'should show holdings');
  });

  await test('invalid amount shows retry message and keeps pending', async () => {
    pendingMimic.set(55555, { investorId: 'dalio', stage: 'amount', ethicsEnabled: false });
    const ctx = makeCtx('abc', 55555);
    await runMimicFromAmount(ctx, 'abc');
    assert.ok(pendingMimic.has(55555), 'pending state should remain on invalid input');
    const reply = lastReply(ctx);
    assert.ok(reply.includes('valid'), 'should prompt for valid number');
    pendingMimic.delete(55555);
  });

  sw.mimicInvestor = origMimic;
}

// ─── 11. CANCEL COMMAND ──────────────────────────────────────────────────────

async function runCancelTests() {
  section('/cancel command');

  await test('/cancel clears pending experiment and mimic states', async () => {
    const src = fs.readFileSync('dist/commands/index.js', 'utf8');
    assert.ok(src.includes("bot.command('cancel'"), '/cancel should be registered');
    assert.ok(src.includes('pendingExperiment.delete'), '/cancel should clear pending experiment');
    assert.ok(src.includes('pendingMimic.delete'), '/cancel should clear pending mimic');
  });
}

// ─── run all ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 StockWiseBot E2E Tests\n');

  await runWatchlistTests();
  await runExperimentTests();
  await runScoreTests();
  await runPortfolioTests();
  await runSimulateMetricsTests();
  await runChatExperimentFlowTests();
  await runNLPTests();
  await runValidationTests();
  await runCommandParsingTests();
  await runMimicTests();
  await runCancelTests();

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(50)}`);
  if (failed === 0) {
    console.log(`🎉 All ${passed} E2E tests passed`);
  } else {
    console.log(`✅ ${passed} passed  ❌ ${failed} failed`);
    failures.forEach(({ name, err }) => console.log(`\n  FAIL: ${name}\n    ${err.message}`));
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

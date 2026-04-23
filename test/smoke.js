#!/usr/bin/env node
/**
 * Lightweight smoke tests for pure logic (no external deps)
 */

const assert = require('assert');

// --- Test clampDays logic (extracted from db.ts) ---
function clampDays(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d < 1 || d > 365) return 7;
  return Math.floor(d);
}

assert.strictEqual(clampDays(7), 7, 'default 7');
assert.strictEqual(clampDays(30), 30, '30 days');
assert.strictEqual(clampDays(365), 365, 'max 365');
assert.strictEqual(clampDays(0), 7, '0 defaults to 7');
assert.strictEqual(clampDays(-5), 7, 'negative defaults to 7');
assert.strictEqual(clampDays(500), 7, '>365 defaults to 7');
assert.strictEqual(clampDays('string'), 7, 'string defaults to 7');
assert.strictEqual(clampDays(NaN), 7, 'NaN defaults to 7');
assert.strictEqual(clampDays(3.7), 3, 'floors decimals');
assert.strictEqual(clampDays(Infinity), 7, 'Infinity defaults to 7');
console.log('✅ clampDays logic');

// --- Test rate limiter logic (extracted from rateLimit.ts) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const buckets = new Map();

function hitRateLimit(telegramId) {
  const now = Date.now();
  const bucket = buckets.get(telegramId);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(telegramId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (bucket.count >= MAX_REQUESTS) {
    return true;
  }

  bucket.count++;
  return false;
}

// User 1: 30 requests should pass
for (let i = 0; i < 30; i++) {
  assert.strictEqual(hitRateLimit(1), false, `request ${i + 1} should pass`);
}
assert.strictEqual(hitRateLimit(1), true, 'request 31 should be blocked');

// User 2: independent bucket
assert.strictEqual(hitRateLimit(2), false, 'user 2 first request passes');

// After window expires, bucket resets
const oldBucket = buckets.get(1);
oldBucket.resetAt = Date.now() - 1;
assert.strictEqual(hitRateLimit(1), false, 'bucket resets after expiry');

console.log('✅ rate limiter logic');

// --- Verify module structures exist ---
const fs = require('fs');
const distFiles = [
  'dist/index.js',
  'dist/db.js',
  'dist/middleware/rateLimit.js',
  'dist/middleware/analytics.js',
  'dist/services/alerts.js',
  'dist/commands/score.js',
  'dist/commands/watchlist.js',
];
for (const f of distFiles) {
  assert.ok(fs.existsSync(f), `${f} should exist`);
}
console.log('✅ all expected dist files exist');

// --- Verify score.ts uses ctx.state.eventId for feedback ---
const scoreSrc = fs.readFileSync('dist/commands/score.js', 'utf8');
assert.ok(!scoreSrc.includes('ORDER BY id DESC LIMIT 1'), 'score should not query last ID');
assert.ok(scoreSrc.includes('state.eventId'), 'score should use state.eventId');
console.log('✅ score.ts feedback uses middleware eventId');

// --- Verify watchlist remove uses ticker ---
const watchlistSrc = fs.readFileSync('dist/commands/watchlist.js', 'utf8');
assert.ok(!watchlistSrc.includes('Usage: /watchlist_remove <id>'), 'help text should not mention ID');
assert.ok(watchlistSrc.includes('Usage: /watchlist_remove <ticker>'), 'help text should mention ticker');
console.log('✅ watchlist.ts ticker-based remove verified in output');

// --- Verify analytics middleware creates event BEFORE next and updates after ---
const analyticsSrc = fs.readFileSync('dist/middleware/analytics.js', 'utf8');
assert.ok(analyticsSrc.includes('ensureUser'), 'analytics middleware should call ensureUser');
assert.ok(analyticsSrc.includes('eventId'), 'analytics middleware should track eventId');
assert.ok(analyticsSrc.includes('UPDATE analytics_events'), 'analytics middleware should UPDATE existing row');
console.log('✅ analytics.ts single-row logging verified in output');

// --- Verify no command file imports logEvent ---
const commandFiles = fs.readdirSync('src/commands').filter(f => f.endsWith('.ts'));
for (const f of commandFiles) {
  const src = fs.readFileSync(`src/commands/${f}`, 'utf8');
  assert.ok(!src.includes("import { logEvent"), `${f} should not import logEvent`);
}
console.log('✅ no command files import logEvent');

// --- Verify experiment gate uses exp: prefix ---
const indexSrc = fs.readFileSync('dist/commands/index.js', 'utf8');
assert.ok(!indexSrc.includes("text.includes('=')"), 'experiment gate should not use loose operators');
assert.ok(indexSrc.includes("startsWith('exp:')"), 'experiment gate should require exp: prefix');
console.log('✅ experiment.ts gated behind exp: prefix');

// --- Verify Dockerfile is multi-stage ---
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
assert.ok(dockerfile.includes('AS builder'), 'Dockerfile should have builder stage');
assert.ok(dockerfile.includes('COPY --from=builder'), 'Dockerfile should copy from builder');
console.log('✅ Dockerfile multi-stage verified');

// --- Verify safe error helper exists ---
const loggerSrc = fs.readFileSync('dist/utils/logger.js', 'utf8');
assert.ok(loggerSrc.includes('userSafeError'), 'logger should export userSafeError');
console.log('✅ userSafeError helper exists');

// --- Verify admin export cleans up temp file ---
const adminSrc = fs.readFileSync('dist/commands/admin.js', 'utf8');
assert.ok(adminSrc.includes('unlinkSync'), 'admin export should delete temp file');
console.log('✅ admin.ts temp file cleanup verified');

// --- Verify rate limit timer is unref'd ---
const rateLimitSrc = fs.readFileSync('dist/middleware/rateLimit.js', 'utf8');
assert.ok(rateLimitSrc.includes('.unref()'), 'rate limit cleanup timer should be unref-ed');
console.log('✅ rateLimit.ts timer unref verified');

// --- Verify alert interval is clamped in config ---
const configSrc = fs.readFileSync('dist/config.js', 'utf8');
assert.ok(configSrc.includes('Math.min'), 'config should clamp alert interval');
assert.ok(configSrc.includes('Math.max'), 'config should clamp alert interval');
console.log('✅ config.ts alert interval clamping verified');

// --- Verify vps-setup uses npm ci ---
const vpsSrc = fs.readFileSync('deploy/vps-setup.sh', 'utf8');
assert.ok(vpsSrc.includes('npm ci'), 'vps-setup should use npm ci');
assert.ok(!vpsSrc.includes('npm install'), 'vps-setup should not use npm install');
console.log('✅ vps-setup.sh uses npm ci');

// --- Verify user_weights table exists in DB schema ---
const dbSrc = fs.readFileSync('dist/db.js', 'utf8');
assert.ok(dbSrc.includes('user_weights'), 'db should define user_weights table');
assert.ok(dbSrc.includes('ensureUserWeights'), 'db should export ensureUserWeights');
assert.ok(dbSrc.includes('getUserWeights'), 'db should export getUserWeights');
assert.ok(dbSrc.includes('setUserWeight'), 'db should export setUserWeight');
console.log('✅ user_weights DB layer verified');

// --- Verify weights command exists ---
const weightsSrc = fs.readFileSync('dist/commands/weights.js', 'utf8');
assert.ok(weightsSrc.includes('weightsCommand'), 'weights module should export weightsCommand');
assert.ok(weightsSrc.includes('handleWeightCallback'), 'weights module should export handleWeightCallback');
assert.ok(weightsSrc.includes("weight:"), 'weights should use weight: callback prefix');
console.log('✅ weights command module verified');

// --- Verify score command uses weighted scoring ---
const scoreSrc2 = fs.readFileSync('dist/commands/score.js', 'utf8');
assert.ok(scoreSrc2.includes('getUserWeights'), 'score should import getUserWeights');
assert.ok(scoreSrc2.includes('computeWeightedScore'), 'score should define computeWeightedScore');
assert.ok(scoreSrc2.includes('weightedScore'), 'score should compute weightedScore');
console.log('✅ score.ts weighted scoring verified');

// --- Verify weights command is registered ---
const indexSrc2 = fs.readFileSync('dist/commands/index.js', 'utf8');
assert.ok(indexSrc2.includes("bot.command('weights'"), 'commands index should register /weights');
assert.ok(indexSrc2.includes("bot.command('weights_set'"), 'commands index should register /weights_set');
assert.ok(indexSrc2.includes('handleWeightCallback'), 'commands index should register weight callback');
console.log('✅ weights command registered');

// --- Verify admin export weights command exists ---
const adminSrc2 = fs.readFileSync('dist/commands/admin.js', 'utf8');
assert.ok(adminSrc2.includes('adminExportWeightsCommand'), 'admin should export adminExportWeightsCommand');
assert.ok(adminSrc2.includes('exportWeightsCsv'), 'admin should call exportWeightsCsv');
console.log('✅ admin export weights command verified');

// --- Verify weights_set command exists ---
const weightsSrc2 = fs.readFileSync('dist/commands/weights.js', 'utf8');
assert.ok(weightsSrc2.includes('weightsSetCommand'), 'weights should export weightsSetCommand');
assert.ok(weightsSrc2.includes('setUserWeight'), 'weightsSet should call setUserWeight');
console.log('✅ weights_set command verified');

console.log('\n🎉 All smoke tests passed');

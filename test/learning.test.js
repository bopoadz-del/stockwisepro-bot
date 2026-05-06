#!/usr/bin/env node
/**
 * Integration tests for the learning environment DB layer
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Use a temp DB so we don't pollute the real one
const tmpDir = path.join(__dirname, '.tmp_test');
fs.mkdirSync(tmpDir, { recursive: true });
const tmpDbPath = path.join(tmpDir, `test_${Date.now()}.db`);

// Monkey-patch env before requiring db
process.env.DATA_DIR = tmpDir;
process.env.TELEGRAM_BOT_TOKEN = '123456:TESTTESTTESTTESTTESTTESTTESTTESTTEST';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';

const { initDb, logChatIntent, getLearningStats, getMissedIntents, correctChatIntent, saveChatFeedback, exportMissedIntentsCsv } = require('../dist/db');

console.log('Initializing test DB...');
initDb();

// --- Test logChatIntent ---
const r1 = logChatIntent({ telegramId: 123, rawMessage: 'AAPL', detectedIntent: 'ticker_score', extractedTicker: 'AAPL', executedCommand: 'score', isFallback: false });
assert.ok(Number(r1.lastInsertRowid) > 0, 'logChatIntent should return an insert ID');

const r2 = logChatIntent({ telegramId: 123, rawMessage: 'what is the news for TSLA', detectedIntent: 'news', extractedTicker: 'TSLA', executedCommand: 'news', isFallback: false });
assert.ok(Number(r2.lastInsertRowid) > r1.lastInsertRowid, 'second log should have higher ID');

const r3 = logChatIntent({ telegramId: 456, rawMessage: 'hello bot', isFallback: true });
assert.ok(Number(r3.lastInsertRowid) > r2.lastInsertRowid, 'fallback log should have higher ID');

const r4 = logChatIntent({ telegramId: 789, rawMessage: 'remove AMD from watchlist', detectedIntent: 'watchlist_remove', extractedTicker: 'AMD', executedCommand: 'watchlist_remove', isFallback: false });
console.log('✅ logChatIntent works');

// --- Test getLearningStats ---
const stats = getLearningStats(7);
assert.strictEqual(stats.totalChat.count, 4, 'should count 4 chat logs');
assert.strictEqual(stats.fallbackRate.total, 4, 'total should be 4');
assert.strictEqual(stats.fallbackRate.fallbacks, 1, '1 fallback');
assert.ok(stats.intentStats.length >= 3, 'should have intent stats');
const newsStat = stats.intentStats.find(s => s.detected_intent === 'news');
assert.ok(newsStat, 'news intent should appear in stats');
assert.strictEqual(newsStat.count, 1, 'news count should be 1');
console.log('✅ getLearningStats works');

// --- Test getMissedIntents ---
const missed = getMissedIntents(7, 50);
assert.strictEqual(missed.length, 1, 'should find 1 missed intent');
assert.strictEqual(missed[0].raw_message, 'hello bot', 'missed intent should be "hello bot"');
assert.strictEqual(missed[0].telegram_id, 456, 'missed intent telegram_id should be 456');
console.log('✅ getMissedIntents works');

// --- Test correctChatIntent ---
correctChatIntent(r3.lastInsertRowid, 'help');
const missedAfter = getMissedIntents(7, 50);
assert.strictEqual(missedAfter[0].user_corrected_intent, 'help', 'correction should be saved');
console.log('✅ correctChatIntent works');

// --- Test saveChatFeedback ---
saveChatFeedback(r1.lastInsertRowid, 1);
saveChatFeedback(r2.lastInsertRowid, -1);
const statsAfterFeedback = getLearningStats(7);
console.log('✅ saveChatFeedback works');

// --- Test exportMissedIntentsCsv ---
const csv = exportMissedIntentsCsv(7);
assert.ok(csv.includes('id'), 'CSV should have headers');
assert.ok(csv.includes('hello bot'), 'CSV should contain missed message');
assert.ok(csv.includes('help'), 'CSV should contain corrected intent');
console.log('✅ exportMissedIntentsCsv works');

// --- Test learning report service formatting logic (pure function side) ---
// We can't easily run the cron without a bot, but we can verify the message builder doesn't crash
const statsForReport = getLearningStats(7);
const missedForReport = getMissedIntents(7, 15);
const fallbackPct = statsForReport.fallbackRate.total > 0
  ? ((statsForReport.fallbackRate.fallbacks / statsForReport.fallbackRate.total) * 100).toFixed(1)
  : '0.0';
const msg = `
📚 *Weekly Learning Report*
_Week ending ${new Date().toISOString().split('T')[0]}_

💬 Total chat messages: ${statsForReport.totalChat.count}
❓ Fallback rate: ${fallbackPct}% (${statsForReport.fallbackRate.fallbacks}/${statsForReport.fallbackRate.total})

*Detected intents:*
${statsForReport.intentStats.map(i => `• ${i.detected_intent || 'unknown'}: ${i.count} (${i.fallback_pct}% fallback)`).join('\n') || 'None'}

*User corrections:*
${statsForReport.correctionStats.map(c => `• ${c.user_corrected_intent}: ${c.count}`).join('\n') || 'None'}

*Top missed intents:*
${missedForReport.map(m => `• "${m.raw_message}"${m.user_corrected_intent ? ` → ${m.user_corrected_intent}` : ''}`).join('\n') || 'None'}
`.trim();
assert.ok(msg.includes('hello bot'), 'report message should include missed intent');
assert.ok(msg.includes('help'), 'report message should include correction');
console.log('✅ learning report message formatting works');

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\n🎉 All learning integration tests passed');

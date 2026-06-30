// Offline regression test for ticker extraction from OCR text.
// Captured from real tesseract output (PSM.AUTO, mixed case) on a brokerage
// portfolio screenshot. Guards the structural "ticker over company-name" pass
// and the bare-list fallback. No tesseract run here -> fast and deterministic.

// Config requires these at import time; set harmless defaults for the test.
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890';
process.env.FMP_API_KEY = process.env.FMP_API_KEY || 'dummy';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_secret_test_secret_test_secret_test_secret_xx';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const assert = require('assert');
const { extractTickers } = require('../dist/services/ocr.js');

// Real OCR output (symbol column + a trailing numbers block, plus header chrome).
const PORTFOLIO_OCR = `
us -
© Open
Positions Orders
Symbol
NEM
Newmont Corpora
SO
Southern Company
LYv
Live Nation Entert
NI
NiSource Inc
AMX
America Movil SA
SIVR
abrdn Physical Sil
IBIT
Shares Bitcoin Tru
SGOL
abrdn Physical Go.
Mkt Value
Quantity
1,134.48
12
967.60
10
`;

const got = extractTickers(PORTFOLIO_OCR);
const want = ['NEM', 'SO', 'LYV', 'NI', 'AMX', 'SIVR', 'IBIT', 'SGOL'];

for (const w of want) {
  assert.ok(got.includes(w), `expected ticker ${w} to be extracted, got: ${got}`);
}
for (const junk of ['O', 'C', 'T', 'A', 'US']) {
  assert.ok(!got.includes(junk), `did not expect junk ticker ${junk}, got: ${got}`);
}
console.log('✅ structural portfolio extraction:', got.join(', '));

// Fallback: a bare watchlist with no company names should still resolve via the
// universe path, and bare single letters must not be invented.
const bareList = extractTickers('$AAPL $MSFT\nNVDA\nO\nGOOGL');
assert.ok(bareList.includes('AAPL') && bareList.includes('MSFT') && bareList.includes('NVDA') && bareList.includes('GOOGL'),
  `fallback list missing tickers, got: ${bareList}`);
assert.ok(!bareList.includes('O'), `fallback should not invent single-letter O, got: ${bareList}`);
console.log('✅ fallback bare-list extraction:', bareList.join(', '));

console.log('\n🎉 OCR extraction tests passed');

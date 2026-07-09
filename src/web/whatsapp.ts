/**
 * WhatsApp Twilio Webhook Handler
 * Integrated into stockwisepro-bot — uses the same OpenBox scoring engine
 * and OCR service that the Telegram bot uses. No HTTP API calls needed.
 */

import { Router } from 'express';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { runOCR } from '../services/ocr';
import { fmp } from '../api/fmp';
import { logger } from '../utils/logger';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
// Intent Parser (from stockwise-whatsapp)
// ═══════════════════════════════════════════════════════════════════════

const COMMON_WORDS = new Set([
  'A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR',
  'SO', 'TO', 'UP', 'US', 'WE', 'ALL', 'AND', 'ARE', 'BUT', 'CAN', 'FOR', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOW',
  'ITS', 'NEW', 'NOT', 'NOW', 'OFF', 'OLD', 'ONE', 'OUR', 'OUT', 'SEE', 'SHE', 'THE', 'TWO', 'USE', 'WAY', 'WHO',
  'YES', 'YET', 'YOU', 'WHY', 'HEY', 'HII', 'THEY', 'THEM', 'THAN', 'THEN', 'THAT', 'THIS', 'WILL', 'WITH', 'HAVE',
  'FROM', 'HELP', 'STOP', 'MENU', 'HOLA', 'INFO', 'SCORE', 'STOCK', 'PRICE', 'ABOUT', 'WORTH', 'SHOULD', 'BUY',
]);

const GREETINGS = new Set(['hi', 'hello', 'hey', 'start', 'help', 'menu', 'hola', 'yo', 'sup']);

function extractTicker(text: string): string | undefined {
  const dollar = text.match(/\$([A-Za-z]{1,5})\b/);
  if (dollar) return dollar[1].toUpperCase();
  const upper = text.match(/\b[A-Z]{1,5}\b/g);
  if (upper) {
    for (const tok of upper) {
      if (!COMMON_WORDS.has(tok)) return tok;
    }
  }
  return undefined;
}

type IntentType = 'score' | 'explain' | 'screenshot' | 'help';

interface Intent {
  type: IntentType;
  ticker?: string;
  query?: string;
}

function parseIntent(body: string, hasMedia: boolean): Intent {
  const text = (body || '').trim();
  if (!text) return { type: 'help' };

  const lower = text.toLowerCase();
  const firstWord = lower.split(/\s+/)[0];

  // Greeting → help
  if (GREETINGS.has(firstWord) && text.split(/\s+/).length === 1) {
    return { type: 'help' };
  }

  // Image without text → treat as screenshot
  if (hasMedia && !text) return { type: 'screenshot' };
  if (hasMedia && (lower.includes('portfolio') || lower.includes('score this') || lower.includes('what'))) {
    return { type: 'screenshot' };
  }

  const wantsExplain = /\b(explain|why|reason|breakdown|tell me about)\b/.test(lower);
  const ticker = extractTicker(text);

  if (wantsExplain && ticker) return { type: 'explain', ticker };
  if (ticker) return { type: 'score', ticker };
  if (/\b(score|stock|price|quote|rate|worth)\b/.test(lower)) {
    return { type: 'score', query: stripKeywords(text) };
  }

  return { type: 'help' };
}

function stripKeywords(text: string): string {
  return text
    .replace(/\b(explain|why|reason|breakdown|tell me about|score|stock|price|quote|rate|worth|the|of|for|me|about)\b/gi, ' ')
    .replace(/[?$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════
// WhatsApp Text Formatter
// ═══════════════════════════════════════════════════════════════════════

function signalLabel(score: number): string {
  if (score >= 85) return 'STRONG BUY';
  if (score >= 70) return 'BUY';
  if (score >= 55) return 'HOLD';
  if (score >= 40) return 'WATCH';
  return 'AVOID';
}

function grade(score: number): string {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function formatScore(ticker: string, score: number, quote?: any): string {
  const emoji = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
  const priceLine = quote && quote.price
    ? `\nPrice: $${quote.price.toFixed(2)}${quote.changesPercentage !== undefined ? ` (${quote.changesPercentage >= 0 ? '+' : ''}${quote.changesPercentage.toFixed(2)}%)` : ''}`
    : '';
  return `*${ticker}*${priceLine}\nScore: *${score}/100* (Grade: ${grade(score)})\nSignal: ${signalLabel(score)}\n\n_Experimental study — not financial advice._`;
}

function formatExplain(ticker: string, score: number): string {
  return `*${ticker}* — ${score}/100 (${signalLabel(score)})\n\nReply "explain ${ticker}" for detailed breakdown.\n\n_Experimental study — not financial advice._`;
}

const HELP_TEXT =
  '*StockWise on WhatsApp* 📈\n\n' +
  'Send me a ticker to score it:\n' +
  '• `AAPL` or `score TSLA`\n' +
  '• `explain NVDA` — reasoning\n' +
  '• Send a *screenshot* of your portfolio — I will score every stock\n\n' +
  '_Experimental study — not financial advice._';

// ═══════════════════════════════════════════════════════════════════════
// Core Handler
// ═══════════════════════════════════════════════════════════════════════

async function handleWhatsAppMessage(body: string, from: string, mediaUrl?: string): Promise<string> {
  const hasMedia = !!mediaUrl;
  const intent = parseIntent(body, hasMedia);

  if (intent.type === 'help') return HELP_TEXT;

  // ── Screenshot with OCR ──
  if (intent.type === 'screenshot' && mediaUrl) {
    return await handleScreenshot(mediaUrl, from);
  }

  // ── Score / Explain ──
  const ticker = intent.ticker || body.trim().toUpperCase();
  if (!ticker || ticker.length < 1 || ticker.length > 5) {
    return HELP_TEXT;
  }

  // Get score directly from OpenBox engine
  const scoreResult = await computeOpenBoxScore(ticker);
  if (!scoreResult) {
    return `Could not score *${ticker}* right now. Please try again.`;
  }

  const score = scoreResult.finalScore;

  if (intent.type === 'explain') {
    return formatExplain(ticker, score);
  }

  // Score with quote
  let quote = null;
  try {
    quote = await fmp.getQuote(ticker);
  } catch { /* ignore */ }

  return formatScore(ticker, score, quote);
}

// ── Screenshot OCR Handler ──

async function handleScreenshot(mediaUrl: string, from: string): Promise<string> {
  try {
    logger.info('WhatsApp screenshot OCR', { from });

    // Download image from Twilio media URL
    const axios = require('axios');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tmpPath = path.join(os.tmpdir(), `wa_ocr_${Date.now()}.jpg`);

    // Download with basic auth if Twilio credentials are set
    const auth = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN }
      : undefined;

    const response = await axios.get(mediaUrl, {
      responseType: 'stream',
      auth,
      timeout: 30000,
    });

    const writer = fs.createWriteStream(tmpPath);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Run OCR (uses the enhanced service with confusion correction)
    const { tickers, rawText, corrections } = await runOCR(tmpPath);

    // Cleanup
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    if (tickers.length === 0) {
      const preview = rawText.length > 200 ? rawText.slice(0, 200) + '…' : rawText;
      return `🤖 No tickers found in the image.\n\n_Raw text:_ \`${preview}\`\n\nTry a clearer screenshot.`;
    }

    // Score all found tickers
    const lines: string[] = [];
    for (const t of tickers.slice(0, 10)) {
      try {
        const result = await computeOpenBoxScore(t);
        if (result) {
          const emoji = result.finalScore >= 70 ? '🟢' : result.finalScore >= 50 ? '🟡' : '🔴';
          lines.push(`*${t}* — ${emoji} ${result.finalScore}/100`);
        } else {
          lines.push(`*${t}* — ❌ could not score`);
        }
      } catch {
        lines.push(`*${t}* — ❌ error`);
      }
      // Small delay to avoid rate limits
      if (tickers.length > 1) await new Promise(r => setTimeout(r, 500));
    }

    let correctionText = '';
    if (corrections && corrections.length > 0) {
      correctionText = '\n\n📝 _OCR corrections:_\n' + corrections.map(c => `  ${c}`).join('\n');
    }

    return `📸 *Screenshot parsed — ${tickers.length} ticker(s):*\n\n${lines.join('\n')}${correctionText}\n\n_Send another screenshot or type a ticker._`;

  } catch (err: any) {
    logger.error('WhatsApp screenshot error', { error: err.message, from });
    return '❌ Failed to process the screenshot. Please try again.';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Twilio Webhook Route
// ═══════════════════════════════════════════════════════════════════════

// POST /api/whatsapp — Twilio "When a message comes in" webhook
router.post('/', async (req, res) => {
  const body: string = (req.body?.Body || req.body?.body || '');
  const from: string = (req.body?.From || 'unknown');
  const numMedia: number = parseInt(req.body?.NumMedia || '0', 10);
  const mediaUrl: string | undefined = numMedia > 0 ? req.body?.MediaUrl0 : undefined;

  logger.info('WhatsApp message', { from, hasMedia: numMedia > 0, bodyPreview: body.slice(0, 50) });

  let reply: string;
  try {
    reply = await handleWhatsAppMessage(body, from, mediaUrl);
  } catch (err: any) {
    logger.error('WhatsApp handler error', { error: err.message, from });
    reply = 'Something went wrong — please try again in a moment.';
  }

  // TwiML XML response
  res.set('Content-Type', 'text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Message>${escapeXml(reply)}</Message></Response>`
  );
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;

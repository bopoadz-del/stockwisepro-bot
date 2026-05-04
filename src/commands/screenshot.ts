import { Context } from 'telegraf';
import { createWorker } from 'tesseract.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { computeOpenBoxScore } from '../services/openbox/engine';
import { logger } from '../utils/logger';

const TMP_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'tmp') : '/tmp';

function extractTickers(text: string): string[] {
  const tickers: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: $TICKER
  const dollarMatches = text.match(/\$([A-Z]{1,5})/g);
  if (dollarMatches) {
    for (const m of dollarMatches) {
      const ticker = m.replace('$', '').toUpperCase();
      if (!seen.has(ticker) && ticker.length >= 1 && ticker.length <= 5) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
  }

  // Pattern 2: Standalone uppercase 1-5 letter words that look like tickers
  // Exclude common words and be more strict
  const commonWords = new Set([
    'A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR',
    'SO', 'TO', 'UP', 'US', 'WE', 'ALL', 'AND', 'ARE', 'BUT', 'CAN', 'FOR', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOW',
    'ITS', 'NEW', 'NOT', 'NOW', 'OFF', 'OLD', 'ONE', 'OUR', 'OUT', 'SEE', 'SHE', 'THE', 'TWO', 'USE', 'WAY', 'WHO',
    'YES', 'YET', 'YOU', 'THEY', 'THEM', 'THAN', 'THEN', 'THAT', 'THIS', 'WILL', 'WITH', 'HAVE', 'FROM', 'HERE',
    'WANT', 'BEEN', 'WERE', 'SAID', 'EACH', 'WHICH', 'THEIR', 'TIME', 'VERY', 'WHEN', 'MUCH', 'WOULD', 'THERE',
    'ABOUT', 'OTHER', 'RIGHT', 'FIRST', 'ALSO', 'AFTER', 'BACK', 'ONLY', 'KNOW', 'TAKE', 'YEAR', 'GOOD', 'SOME',
    'COME', 'MAKE', 'WELL', 'WORK', 'EVEN', 'MORE', 'LONG', 'WHAT', 'FIND', 'GIVE', 'MOST', 'OVER', 'SUCH', 'THINK',
    'WHERE', 'BEING', 'EVERY', 'GREAT', 'MIGHT', 'SHALL', 'STILL', 'THOSE', 'WHILE', 'COULD', 'STATE', 'NEVER',
    'REALLY', 'SHOULD', 'THROUGH', 'BECAUSE', 'BEFORE', 'LITTLE', 'PEOPLE', 'AROUND', 'DURING', 'PLACE', 'THESE',
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SHARES', 'PRICE', 'TOTAL', 'VALUE', 'CASH', 'DATE', 'TYPE', 'QTY',
    'AMT', 'CHG', 'PCT', 'BUY', 'SELL', 'HOLD', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOL', 'AVG', 'MIN', 'MAX',
    'SUM', 'NET', 'GAIN', 'LOSS', 'PROFIT', 'COST', 'BASIS', 'TAX', 'FEE', 'DIV', 'YIELD', 'INT', 'APR',
  ]);

  const wordMatches = text.match(/\b[A-Z]{1,5}\b/g);
  if (wordMatches) {
    for (const m of wordMatches) {
      const ticker = m.toUpperCase();
      if (
        ticker.length >= 1 &&
        ticker.length <= 5 &&
        !commonWords.has(ticker) &&
        !seen.has(ticker) &&
        /^[A-Z]+$/.test(ticker)
      ) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
  }

  return tickers;
}

export async function handleScreenshot(ctx: Context) {
  const telegramId = ctx.from?.id || 0;

  // Get the highest resolution photo
  const photos = ctx.message && 'photo' in ctx.message ? (ctx.message as any).photo : null;
  if (!photos || photos.length === 0) {
    await ctx.reply('❌ Could not retrieve the image. Please try again.');
    return;
  }

  const largest = photos[photos.length - 1];
  const fileId = largest.file_id;

  await ctx.replyWithChatAction('typing');

  let tmpPath = '';
  try {
    // Get file link from Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileUrl = fileLink.href;

    // Download the image
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
    tmpPath = path.join(TMP_DIR, `screenshot_${telegramId}_${Date.now()}.jpg`);

    const response = await axios.get(fileUrl, {
      responseType: 'stream',
      timeout: 30000,
    });

    const writer = fs.createWriteStream(tmpPath);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await ctx.replyWithChatAction('typing');

    // Run OCR
    const worker = await createWorker('eng');
    const {
      data: { text },
    } = await worker.recognize(tmpPath);
    await worker.terminate();

    if (!text || text.trim().length === 0) {
      await ctx.reply('🤖 Could not read any text from the image. Try a clearer screenshot.');
      return;
    }

    // Extract tickers
    const tickers = extractTickers(text);

    if (tickers.length === 0) {
      await ctx.reply(
        '🤖 No ticker symbols found in the image.\n\n' +
        'I look for text like *AAPL*, *$TSLA*, etc. Try a clearer screenshot of your portfolio.'
      );
      return;
    }

    await ctx.replyWithChatAction('typing');

    // Score each ticker
    const results: { ticker: string; score: number | null; error?: string }[] = [];
    for (const ticker of tickers.slice(0, 10)) {
      try {
        const scoreResult = await computeOpenBoxScore(ticker, telegramId);
        results.push({ ticker, score: scoreResult?.finalScore ?? null });
      } catch (err) {
        results.push({ ticker, score: null, error: 'Failed to score' });
      }
    }

    // Build response
    const lines = results.map((r, i) => {
      if (r.score !== null) {
        const emoji = r.score >= 70 ? '🟢' : r.score >= 50 ? '🟡' : '🔴';
        return `${i + 1}. *${r.ticker}* — ${emoji} ${r.score}/100`;
      }
      return `${i + 1}. *${r.ticker}* — ❌ Could not score`;
    });

    await ctx.replyWithMarkdown(
      `📸 *Screenshot parsed — ${tickers.length} ticker(s) found:*\n\n` +
      `${lines.join('\n')}\n\n` +
      `_Use /score <ticker> for detailed analysis._`
    );
  } catch (err) {
    logger.error('Screenshot processing failed', { error: String(err), telegramId });
    await ctx.reply('❌ Failed to process the screenshot. Please try again later.');
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

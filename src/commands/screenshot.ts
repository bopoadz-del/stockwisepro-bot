import { Context } from 'telegraf';
import axios from 'axios';
import fs from 'fs';
import { runOCR, scoreTickers, makeTmpPath, cleanupFile } from '../services/ocr';
import { logger } from '../utils/logger';

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
    tmpPath = makeTmpPath(`screenshot_${telegramId}`);

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

    // Run OCR (now with confusion correction + optional Cloud Vision)
    const { tickers, rawText, corrections } = await runOCR(tmpPath);

    if (!rawText || rawText.trim().length === 0) {
      await ctx.reply('🤖 Could not read any text from the image. Try a clearer screenshot.');
      return;
    }

    if (tickers.length === 0) {
      const rawPreview = rawText.length > 300 ? rawText.slice(0, 300) + '…' : rawText;
      await ctx.reply(
        '🤖 No ticker symbols found in the image.\n\n' +
        'I look for text like *AAPL*, *$TSLA*, etc. Try a clearer screenshot of your portfolio.\n\n' +
        `_Raw text I read:_\n` +
        `\`\`\`${rawPreview}\`\`\``
      );
      return;
    }

    await ctx.replyWithChatAction('typing');

    // Score each ticker
    const results = await scoreTickers(tickers, telegramId);

    // Build response
    const lines = results.map((r, i) => {
      if (r.score !== null) {
        const emoji = r.score >= 70 ? '🟢' : r.score >= 50 ? '🟡' : '🔴';
        return `${i + 1}. *${r.ticker}* — ${emoji} ${r.score}/100`;
      }
      if (r.price !== undefined) {
        const changeStr = r.changePct !== undefined
          ? `(${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%)`
          : '';
        return `${i + 1}. *${r.ticker}* — $${r.price.toFixed(2)} ${changeStr} _(score unavailable)_`;
      }
      return `${i + 1}. *${r.ticker}* — ❌ Could not score`;
    });

    // NEW: Show OCR corrections if any were made
    let correctionText = '';
    if (corrections && corrections.length > 0) {
      correctionText = '\n\n📝 _OCR corrections:_\n' + corrections.map(c => `  ${c}`).join('\n');
    }

    await ctx.replyWithMarkdown(
      `📸 *Screenshot parsed — ${tickers.length} ticker(s) found:*\n\n` +
      `${lines.join('\n')}` +
      `${correctionText}\n\n` +
      `_Use /score <ticker> for detailed analysis._`
    );
  } catch (err) {
    logger.error('Screenshot processing failed', { error: String(err), telegramId });
    await ctx.reply('❌ Failed to process the screenshot. Please try again later.');
  } finally {
    cleanupFile(tmpPath);
  }
}

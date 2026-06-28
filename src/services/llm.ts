import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Thin client for a local Ollama server (free, self-hosted LLM inference).
 * Entirely optional: when OLLAMA_URL is unset or unreachable, callers fall back
 * to the deterministic insights text. Run Ollama on your own machine and point
 * OLLAMA_URL at it (e.g. http://your-box:11434).
 */

export function isLlmEnabled(): boolean {
  return !!config.ollamaUrl;
}

/** Generate a completion via Ollama's /api/chat. Returns null on any failure. */
export async function llmGenerate(prompt: string, system?: string, timeoutMs = 30000): Promise<string | null> {
  if (!config.ollamaUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ];
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Ollama Cloud (and other hosted gateways) require a bearer token.
    if (config.ollamaApiKey) headers.Authorization = `Bearer ${config.ollamaApiKey}`;

    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: config.ollamaModel, messages, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn('Ollama request failed', { status: res.status });
      return null;
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data?.message?.content?.trim();
    return content || null;
  } catch (err) {
    logger.warn('Ollama request error', { error: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const VALID_TICKER = /^[A-Z0-9.\-]{1,20}$/;

export function validateTicker(ticker: string): boolean {
  return VALID_TICKER.test(ticker);
}

export function sanitizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 20);
}

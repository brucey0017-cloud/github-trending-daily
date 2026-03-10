export function logInfo(message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.log(`[INFO] ${message}`, meta);
    return;
  }
  console.log(`[INFO] ${message}`);
}

export function logWarn(message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.warn(`[WARN] ${message}`, meta);
    return;
  }
  console.warn(`[WARN] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(`[ERROR] ${message}`, error);
    return;
  }
  console.error(`[ERROR] ${message}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 5_000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        logWarn(`Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

export function parseNumber(input: string | undefined | null): number {
  if (!input) {
    return 0;
  }

  const normalized = input.replace(/,/g, '').match(/\d+/g)?.join('') ?? '';
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : 0;
}

export function safeText(input: string | undefined | null): string {
  return (input ?? '').replace(/\s+/g, ' ').trim();
}

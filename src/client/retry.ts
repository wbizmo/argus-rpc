export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface RetryAttempt {
  attempt: number;
  delayMs: number;
}

export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs = 100,
  maxDelayMs = 1000
): number {
  const delay = baseDelayMs * 2 ** Math.max(0, attempt - 1);

  return Math.min(delay, maxDelayMs);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt > retries || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

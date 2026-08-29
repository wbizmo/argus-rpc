import { ArgusError } from "../errors";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  maxElapsedMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  random?: () => number;
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

export function applyBackoffJitter(
  delayMs: number,
  jitterRatio = 0.2,
  random: () => number = Math.random
): number {
  if (jitterRatio <= 0) return delayMs;
  const boundedRatio = Math.min(jitterRatio, 1);
  const min = delayMs * (1 - boundedRatio);
  const max = delayMs * (1 + boundedRatio);
  return Math.max(0, Math.round(min + (max - min) * random()));
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSafeDefaultRetry(error: unknown): boolean {
  return error instanceof ArgusError && error.retryable;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const random = options.random ?? Math.random;
  const shouldRetry = options.shouldRetry ?? ((error) => isSafeDefaultRetry(error));
  const startedAt = Date.now();

  if (!Number.isInteger(retries) || retries < 0) throw new Error("ARGUS_INVALID_RETRY_COUNT");
  if (baseDelayMs < 0 || maxDelayMs < 0 || maxDelayMs < baseDelayMs) {
    throw new Error("ARGUS_INVALID_RETRY_BACKOFF");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt > retries || !shouldRetry(error, attempt)) {
        throw error;
      }

      const baseDelay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      const delayMs = applyBackoffJitter(baseDelay, jitterRatio, random);

      if (
        options.maxElapsedMs !== undefined &&
        Date.now() - startedAt + delayMs >= options.maxElapsedMs
      ) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

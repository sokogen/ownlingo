import { TranslationError, RateLimitError } from '../types.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_CONFIG, ...config };

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryable(error)) {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      const delay = calculateDelay(error, attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TranslationError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }
    if (message.includes('timeout') || message.includes('econnreset')) {
      return true;
    }
  }

  return false;
}

function calculateDelay(
  error: unknown,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number = 30000
): number {
  if (error instanceof RateLimitError && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, maxDelayMs);
  }

  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

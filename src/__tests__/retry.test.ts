import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../utils/retry.js';
import { TranslationError, RateLimitError } from '../types.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TranslationError('rate limit', 'test', 429, true))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new TranslationError('auth error', 'test', 401, false));

    await expect(withRetry(fn)).rejects.toThrow('auth error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TranslationError('error', 'test', 500, true))
      .mockRejectedValueOnce(new TranslationError('error', 'test', 500, true))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelayMs: 100 });

    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result).toBe('success');
  });

  it('should respect max retries', async () => {
    const error = new TranslationError('error', 'test', 500, true);
    const fn = vi.fn().mockRejectedValue(error);

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 }).catch((e: Error) => e);

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBeInstanceOf(TranslationError);
    expect((result as TranslationError).message).toBe('error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use retryAfterMs from RateLimitError', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('test', 5000))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelayMs: 100 });

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe('success');
  });

  it('should handle generic rate limit errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle timeout errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('request timeout'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
  });
});

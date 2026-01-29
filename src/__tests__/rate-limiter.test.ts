import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../utils/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new RateLimiter({
      tokensPerMinute: 1000,
      requestsPerMinute: 10,
    });
  });

  it('should allow requests within limits', () => {
    expect(rateLimiter.canProceed(100)).toBe(true);
  });

  it('should reject requests exceeding token limit', () => {
    expect(rateLimiter.canProceed(2000)).toBe(false);
  });

  it('should consume tokens and requests', () => {
    rateLimiter.consume(500);
    const status = rateLimiter.getStatus();
    expect(status.remainingTokens).toBe(500);
    expect(status.remainingRequests).toBe(9);
  });

  it('should refill tokens over time', () => {
    rateLimiter.consume(1000);
    expect(rateLimiter.canProceed(100)).toBe(false);

    vi.advanceTimersByTime(30000);
    const status = rateLimiter.getStatus();
    expect(status.remainingTokens).toBe(500);
  });

  it('should not exceed max capacity when refilling', () => {
    vi.advanceTimersByTime(120000);
    const status = rateLimiter.getStatus();
    expect(status.remainingTokens).toBe(1000);
    expect(status.remainingRequests).toBe(10);
  });

  it('should track multiple consumptions', () => {
    rateLimiter.consume(200);
    rateLimiter.consume(300);
    rateLimiter.consume(400);
    const status = rateLimiter.getStatus();
    expect(status.remainingTokens).toBe(100);
    expect(status.remainingRequests).toBe(7);
  });

  it('should calculate reset time correctly', () => {
    rateLimiter.consume(1000);
    const status = rateLimiter.getStatus();
    expect(status.resetInMs).toBeGreaterThan(0);
    expect(status.resetInMs).toBeLessThanOrEqual(60000);
  });

  it('should return 0 reset time when at capacity', () => {
    const status = rateLimiter.getStatus();
    expect(status.resetInMs).toBe(0);
  });
});

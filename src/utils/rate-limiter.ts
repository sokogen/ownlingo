import type { RateLimitConfig, RateLimitStatus } from '../types.js';

export class RateLimiter {
  private tokenBucket: number;
  private requestBucket: number;
  private lastRefill: number;
  private readonly tokensPerMinute: number;
  private readonly requestsPerMinute: number;

  constructor(config: RateLimitConfig) {
    this.tokensPerMinute = config.tokensPerMinute;
    this.requestsPerMinute = config.requestsPerMinute;
    this.tokenBucket = config.tokensPerMinute;
    this.requestBucket = config.requestsPerMinute;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const elapsedMinutes = elapsedMs / 60000;

    this.tokenBucket = Math.min(
      this.tokensPerMinute,
      this.tokenBucket + this.tokensPerMinute * elapsedMinutes
    );
    this.requestBucket = Math.min(
      this.requestsPerMinute,
      this.requestBucket + this.requestsPerMinute * elapsedMinutes
    );
    this.lastRefill = now;
  }

  canProceed(estimatedTokens: number): boolean {
    this.refill();
    return this.requestBucket >= 1 && this.tokenBucket >= estimatedTokens;
  }

  consume(tokens: number): void {
    this.refill();
    this.tokenBucket -= tokens;
    this.requestBucket -= 1;
  }

  getStatus(): RateLimitStatus {
    this.refill();
    const resetInMs = this.calculateResetTime();
    return {
      remainingTokens: Math.max(0, Math.floor(this.tokenBucket)),
      remainingRequests: Math.max(0, Math.floor(this.requestBucket)),
      resetInMs,
    };
  }

  private calculateResetTime(): number {
    if (this.tokenBucket >= this.tokensPerMinute && this.requestBucket >= this.requestsPerMinute) {
      return 0;
    }
    const tokensNeeded = this.tokensPerMinute - this.tokenBucket;
    const requestsNeeded = this.requestsPerMinute - this.requestBucket;
    const tokenRefillTime = (tokensNeeded / this.tokensPerMinute) * 60000;
    const requestRefillTime = (requestsNeeded / this.requestsPerMinute) * 60000;
    return Math.max(tokenRefillTime, requestRefillTime);
  }

  async waitForCapacity(estimatedTokens: number): Promise<void> {
    while (!this.canProceed(estimatedTokens)) {
      const status = this.getStatus();
      const waitTime = Math.min(status.resetInMs, 1000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

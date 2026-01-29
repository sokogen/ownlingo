import { describe, it, expect, vi } from 'vitest';
import { TranslatorChain, createTranslatorChain } from '../translator-chain.js';
import type { AITranslator, TranslationRequest, TranslationResult, RateLimitStatus } from '../types.js';
import { TranslationError } from '../types.js';

function createMockTranslator(
  name: string,
  options: {
    isAvailable?: boolean;
    shouldFail?: boolean;
    failRetryable?: boolean;
    result?: string;
  } = {}
): AITranslator {
  const { isAvailable = true, shouldFail = false, failRetryable = false, result = 'translated' } = options;

  return {
    name,
    model: `${name}-model`,
    async isAvailable() {
      return isAvailable;
    },
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      if (shouldFail) {
        throw new TranslationError(`${name} failed`, name, 500, failRetryable);
      }
      return {
        originalText: request.text,
        translatedText: result,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        provider: name,
        model: `${name}-model`,
        tokensUsed: { input: 10, output: 20, total: 30 },
        cost: 0.001,
      };
    },
    async translateBatch(requests: TranslationRequest[]) {
      const results = await Promise.all(requests.map((r) => this.translate(r)));
      return {
        results,
        totalTokensUsed: { input: 30, output: 60, total: 90 },
        totalCost: 0.003,
        provider: name,
      };
    },
    getRemainingCapacity(): RateLimitStatus {
      return { remainingTokens: 1000, remainingRequests: 10, resetInMs: 0 };
    },
  };
}

describe('TranslatorChain', () => {
  const testRequest: TranslationRequest = {
    text: 'Hello',
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
  };

  describe('translate', () => {
    it('should use primary provider when available', async () => {
      const primary = createMockTranslator('primary', { result: 'Hola' });
      const fallback = createMockTranslator('fallback', { result: 'Hola fallback' });
      const chain = createTranslatorChain(primary, fallback);

      const result = await chain.translate(testRequest);

      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('primary');
    });

    it('should fallback when primary fails with retryable error', async () => {
      const primary = createMockTranslator('primary', { shouldFail: true, failRetryable: true });
      const fallback = createMockTranslator('fallback', { result: 'Hola fallback' });
      const chain = createTranslatorChain(primary, fallback);

      const result = await chain.translate(testRequest);

      expect(result.translatedText).toBe('Hola fallback');
      expect(result.provider).toBe('fallback');
    });

    it('should skip unavailable providers', async () => {
      const primary = createMockTranslator('primary', { isAvailable: false });
      const fallback = createMockTranslator('fallback', { result: 'Hola' });
      const chain = createTranslatorChain(primary, fallback);

      const result = await chain.translate(testRequest);

      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('fallback');
    });

    it('should try multiple fallbacks', async () => {
      const primary = createMockTranslator('primary', { shouldFail: true, failRetryable: true });
      const fallback1 = createMockTranslator('fallback1', { shouldFail: true, failRetryable: true });
      const fallback2 = createMockTranslator('fallback2', { result: 'Hola' });
      const chain = createTranslatorChain(primary, fallback1, fallback2);

      const result = await chain.translate(testRequest);

      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('fallback2');
    });

    it('should throw when all providers fail', async () => {
      const primary = createMockTranslator('primary', { shouldFail: true, failRetryable: true });
      const fallback = createMockTranslator('fallback', { shouldFail: true, failRetryable: true });
      const chain = createTranslatorChain(primary, fallback);

      await expect(chain.translate(testRequest)).rejects.toThrow('All providers failed');
    });

    it('should not fallback on non-retryable error', async () => {
      const primary = createMockTranslator('primary', { shouldFail: true, failRetryable: false });
      const fallback = createMockTranslator('fallback', { result: 'Hola' });
      const chain = createTranslatorChain(primary, fallback);

      await expect(chain.translate(testRequest)).rejects.toThrow('primary failed');
    });
  });

  describe('translateBatch', () => {
    it('should translate multiple requests', async () => {
      const primary = createMockTranslator('primary');
      const chain = createTranslatorChain(primary);

      const requests: TranslationRequest[] = [
        { text: 'Hello', sourceLanguage: 'English', targetLanguage: 'Spanish' },
        { text: 'World', sourceLanguage: 'English', targetLanguage: 'Spanish' },
      ];

      const result = await chain.translateBatch(requests);

      expect(result.results).toHaveLength(2);
      expect(result.totalCost).toBe(0.002);
    });
  });

  describe('isAvailable', () => {
    it('should return true if any provider is available', async () => {
      const primary = createMockTranslator('primary', { isAvailable: false });
      const fallback = createMockTranslator('fallback', { isAvailable: true });
      const chain = createTranslatorChain(primary, fallback);

      expect(await chain.isAvailable()).toBe(true);
    });

    it('should return false if no providers available', async () => {
      const primary = createMockTranslator('primary', { isAvailable: false });
      const fallback = createMockTranslator('fallback', { isAvailable: false });
      const chain = createTranslatorChain(primary, fallback);

      expect(await chain.isAvailable()).toBe(false);
    });
  });

  describe('getRemainingCapacity', () => {
    it('should return primary provider capacity', () => {
      const primary = createMockTranslator('primary');
      const chain = createTranslatorChain(primary);

      const status = chain.getRemainingCapacity();

      expect(status.remainingTokens).toBe(1000);
      expect(status.remainingRequests).toBe(10);
    });
  });
});

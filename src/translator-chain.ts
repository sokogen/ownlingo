import type {
  AITranslator,
  TranslationRequest,
  TranslationResult,
  BatchTranslationResult,
  RateLimitStatus,
  TranslatorChainConfig,
} from './types.js';
import { TranslationError } from './types.js';

export class TranslatorChain implements AITranslator {
  readonly name = 'chain';
  readonly model = 'fallback-chain';

  private readonly primary: AITranslator;
  private readonly fallbacks: AITranslator[];
  private readonly allProviders: AITranslator[];

  constructor(config: TranslatorChainConfig) {
    this.primary = config.primary;
    this.fallbacks = config.fallbacks;
    this.allProviders = [this.primary, ...this.fallbacks];
  }

  async isAvailable(): Promise<boolean> {
    for (const provider of this.allProviders) {
      if (await provider.isAvailable()) {
        return true;
      }
    }
    return false;
  }

  getRemainingCapacity(): RateLimitStatus {
    return this.primary.getRemainingCapacity();
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const errors: Error[] = [];

    for (const provider of this.allProviders) {
      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          continue;
        }

        const result = await provider.translate(request);
        return result;
      } catch (error) {
        errors.push(error as Error);
        if (!this.shouldFallback(error)) {
          throw error;
        }
      }
    }

    throw new TranslationError(
      `All providers failed. Errors: ${errors.map((e) => e.message).join('; ')}`,
      'chain',
      undefined,
      false
    );
  }

  async translateBatch(requests: TranslationRequest[]): Promise<BatchTranslationResult> {
    const results: TranslationResult[] = [];
    let totalTokens = { input: 0, output: 0, total: 0 };
    let totalCost = 0;
    let lastProvider = 'chain';

    for (const request of requests) {
      const result = await this.translate(request);
      results.push(result);
      totalTokens = {
        input: totalTokens.input + result.tokensUsed.input,
        output: totalTokens.output + result.tokensUsed.output,
        total: totalTokens.total + result.tokensUsed.total,
      };
      totalCost += result.cost;
      lastProvider = result.provider;
    }

    return {
      results,
      totalTokensUsed: totalTokens,
      totalCost,
      provider: results.length > 0 ? lastProvider : 'chain',
    };
  }

  private shouldFallback(error: unknown): boolean {
    if (error instanceof TranslationError) {
      return error.retryable;
    }
    return true;
  }
}

export function createTranslatorChain(
  primary: AITranslator,
  ...fallbacks: AITranslator[]
): TranslatorChain {
  return new TranslatorChain({ primary, fallbacks });
}

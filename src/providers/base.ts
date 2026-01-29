import type {
  AITranslator,
  TranslationRequest,
  TranslationResult,
  BatchTranslationResult,
  ProviderConfig,
  TokenUsage,
  RateLimitStatus,
} from '../types.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { getTranslationSystemPrompt, getTranslationUserPrompt } from '../prompts.js';

export interface CostConfig {
  inputTokenCostPer1k: number;
  outputTokenCostPer1k: number;
}

export abstract class BaseTranslator implements AITranslator {
  abstract readonly name: string;
  abstract readonly model: string;
  protected abstract readonly costConfig: CostConfig;

  protected readonly rateLimiter: RateLimiter;
  protected readonly maxRetries: number;
  protected readonly baseRetryDelayMs: number;

  constructor(config: ProviderConfig) {
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.maxRetries = config.maxRetries ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? 1000;
  }

  abstract isAvailable(): Promise<boolean>;
  protected abstract executeTranslation(
    systemPrompt: string,
    userPrompt: string,
    estimatedTokens: number
  ): Promise<{ text: string; usage: TokenUsage }>;

  protected estimateInputTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  protected calculateCost(usage: TokenUsage): number {
    const inputCost = (usage.input / 1000) * this.costConfig.inputTokenCostPer1k;
    const outputCost = (usage.output / 1000) * this.costConfig.outputTokenCostPer1k;
    return inputCost + outputCost;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const systemPrompt = getTranslationSystemPrompt();
    const userPrompt = getTranslationUserPrompt(
      request.text,
      request.sourceLanguage,
      request.targetLanguage,
      request.context
    );

    const estimatedTokens = this.estimateInputTokens(systemPrompt + userPrompt);
    await this.rateLimiter.waitForCapacity(estimatedTokens);

    const result = await withRetry(
      () => this.executeTranslation(systemPrompt, userPrompt, estimatedTokens),
      { maxRetries: this.maxRetries, baseDelayMs: this.baseRetryDelayMs }
    );

    this.rateLimiter.consume(result.usage.total);

    return {
      originalText: request.text,
      translatedText: result.text,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      provider: this.name,
      model: this.model,
      tokensUsed: result.usage,
      cost: this.calculateCost(result.usage),
    };
  }

  async translateBatch(requests: TranslationRequest[]): Promise<BatchTranslationResult> {
    const results: TranslationResult[] = [];
    let totalTokens: TokenUsage = { input: 0, output: 0, total: 0 };
    let totalCost = 0;

    for (const request of requests) {
      const result = await this.translate(request);
      results.push(result);
      totalTokens = {
        input: totalTokens.input + result.tokensUsed.input,
        output: totalTokens.output + result.tokensUsed.output,
        total: totalTokens.total + result.tokensUsed.total,
      };
      totalCost += result.cost;
    }

    return {
      results,
      totalTokensUsed: totalTokens,
      totalCost,
      provider: this.name,
    };
  }

  getRemainingCapacity(): RateLimitStatus {
    return this.rateLimiter.getStatus();
  }
}

import Anthropic from '@anthropic-ai/sdk';
import type { ProviderConfig, TokenUsage } from '../types.js';
import { TranslationError } from '../types.js';
import { BaseTranslator, type CostConfig } from './base.js';

export interface AnthropicConfig extends Omit<ProviderConfig, 'model'> {
  model?: string;
}

const MODEL_COSTS: Record<string, CostConfig> = {
  'claude-sonnet-4-20250514': { inputTokenCostPer1k: 0.003, outputTokenCostPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inputTokenCostPer1k: 0.003, outputTokenCostPer1k: 0.015 },
  'claude-3-haiku-20240307': { inputTokenCostPer1k: 0.00025, outputTokenCostPer1k: 0.00125 },
};

export class AnthropicTranslator extends BaseTranslator {
  readonly name = 'anthropic';
  readonly model: string;
  protected readonly costConfig: CostConfig;

  private readonly client: Anthropic;

  constructor(config: AnthropicConfig) {
    const model = config.model ?? 'claude-sonnet-4-20250514';
    super({ ...config, model });
    this.model = model;
    this.costConfig = MODEL_COSTS[model] ?? MODEL_COSTS['claude-sonnet-4-20250514'];
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return false;
      }
      return true;
    }
  }

  protected async executeTranslation(
    systemPrompt: string,
    userPrompt: string,
    _estimatedTokens: number
  ): Promise<{ text: string; usage: TokenUsage }> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      const text = textBlock?.type === 'text' ? textBlock.text : '';

      const usage: TokenUsage = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      };

      return { text, usage };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const retryable = error.status === 429 || (error.status !== undefined && error.status >= 500);
        throw new TranslationError(
          error.message,
          this.name,
          error.status,
          retryable
        );
      }
      throw error;
    }
  }
}

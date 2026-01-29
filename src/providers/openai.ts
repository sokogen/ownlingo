import OpenAI from 'openai';
import type { ProviderConfig, TokenUsage } from '../types.js';
import { TranslationError } from '../types.js';
import { BaseTranslator, type CostConfig } from './base.js';

export interface OpenAIConfig extends Omit<ProviderConfig, 'model'> {
  model?: string;
}

const MODEL_COSTS: Record<string, CostConfig> = {
  'gpt-4o': { inputTokenCostPer1k: 0.0025, outputTokenCostPer1k: 0.01 },
  'gpt-4o-mini': { inputTokenCostPer1k: 0.00015, outputTokenCostPer1k: 0.0006 },
  'gpt-4-turbo': { inputTokenCostPer1k: 0.01, outputTokenCostPer1k: 0.03 },
};

export class OpenAITranslator extends BaseTranslator {
  readonly name = 'openai';
  readonly model: string;
  protected readonly costConfig: CostConfig;

  private readonly client: OpenAI;

  constructor(config: OpenAIConfig) {
    const model = config.model ?? 'gpt-4o';
    super({ ...config, model });
    this.model = model;
    this.costConfig = MODEL_COSTS[model] ?? MODEL_COSTS['gpt-4o'];
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.model);
      return true;
    } catch {
      return false;
    }
  }

  protected async executeTranslation(
    systemPrompt: string,
    userPrompt: string,
    _estimatedTokens: number
  ): Promise<{ text: string; usage: TokenUsage }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      });

      const text = response.choices[0]?.message?.content ?? '';
      const usage: TokenUsage = {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      };

      return { text, usage };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
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

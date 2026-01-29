import { GoogleGenerativeAI, GoogleGenerativeAIError } from '@google/generative-ai';
import type { ProviderConfig, TokenUsage } from '../types.js';
import { TranslationError } from '../types.js';
import { BaseTranslator, type CostConfig } from './base.js';

export interface GeminiConfig extends Omit<ProviderConfig, 'model'> {
  model?: string;
}

const MODEL_COSTS: Record<string, CostConfig> = {
  'gemini-1.5-pro': { inputTokenCostPer1k: 0.00125, outputTokenCostPer1k: 0.005 },
  'gemini-1.5-flash': { inputTokenCostPer1k: 0.000075, outputTokenCostPer1k: 0.0003 },
  'gemini-2.0-flash': { inputTokenCostPer1k: 0.0001, outputTokenCostPer1k: 0.0004 },
};

export class GeminiTranslator extends BaseTranslator {
  readonly name = 'gemini';
  readonly model: string;
  protected readonly costConfig: CostConfig;

  private readonly client: GoogleGenerativeAI;

  constructor(config: GeminiConfig) {
    const model = config.model ?? 'gemini-1.5-pro';
    super({ ...config, model });
    this.model = model;
    this.costConfig = MODEL_COSTS[model] ?? MODEL_COSTS['gemini-1.5-pro'];
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent('test');
      return true;
    } catch (error) {
      if (error instanceof GoogleGenerativeAIError) {
        if (error.message.includes('API_KEY_INVALID')) {
          return false;
        }
      }
      return true;
    }
  }

  protected async executeTranslation(
    systemPrompt: string,
    userPrompt: string,
    estimatedTokens: number
  ): Promise<{ text: string; usage: TokenUsage }> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.3,
        },
      });

      const result = await model.generateContent(userPrompt);
      const response = result.response;
      const text = response.text();

      const usageMetadata = response.usageMetadata;
      const usage: TokenUsage = {
        input: usageMetadata?.promptTokenCount ?? estimatedTokens,
        output: usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4),
        total: usageMetadata?.totalTokenCount ?? estimatedTokens + Math.ceil(text.length / 4),
      };

      return { text, usage };
    } catch (error) {
      if (error instanceof GoogleGenerativeAIError) {
        const message = error.message.toLowerCase();
        const retryable = message.includes('rate limit') ||
          message.includes('quota') ||
          message.includes('500') ||
          message.includes('503');
        throw new TranslationError(
          error.message,
          this.name,
          undefined,
          retryable
        );
      }
      throw error;
    }
  }
}

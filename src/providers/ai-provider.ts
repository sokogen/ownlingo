// AI Provider Interface for translation services
// ol-002: AI Provider Interface

export interface TranslationRequest {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  context?: string;
}

export interface TranslationResponse {
  translatedText: string;
  provider: string;
  tokensUsed?: number;
}

export interface ProviderRateLimit {
  requestsPerSecond: number;
  requestsPerMinute: number;
  tokensPerMinute?: number;
}

export interface AIProvider {
  name: string;
  rateLimit: ProviderRateLimit;

  /**
   * Translate text from source to target locale
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * Check if provider is available
   */
  isAvailable(): Promise<boolean>;
}

// Mock provider for testing
export class MockAIProvider implements AIProvider {
  name = 'mock';
  rateLimit: ProviderRateLimit = {
    requestsPerSecond: 10,
    requestsPerMinute: 100,
  };

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    // Simple mock: just prefix the text
    return {
      translatedText: `[${request.targetLocale}] ${request.text}`,
      provider: this.name,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

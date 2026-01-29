export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  model: string;
  tokensUsed: TokenUsage;
  cost: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface BatchTranslationResult {
  results: TranslationResult[];
  totalTokensUsed: TokenUsage;
  totalCost: number;
  provider: string;
}

export interface RateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  rateLimit: RateLimitConfig;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface AITranslator {
  readonly name: string;
  readonly model: string;

  translate(request: TranslationRequest): Promise<TranslationResult>;
  translateBatch(requests: TranslationRequest[]): Promise<BatchTranslationResult>;

  isAvailable(): Promise<boolean>;
  getRemainingCapacity(): RateLimitStatus;
}

export interface RateLimitStatus {
  remainingTokens: number;
  remainingRequests: number;
  resetInMs: number;
}

export interface TranslatorChainConfig {
  primary: AITranslator;
  fallbacks: AITranslator[];
}

export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export class RateLimitError extends TranslationError {
  constructor(
    provider: string,
    public readonly retryAfterMs: number
  ) {
    super(`Rate limit exceeded for ${provider}`, provider, 429, true);
    this.name = 'RateLimitError';
  }
}

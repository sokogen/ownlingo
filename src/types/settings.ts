export interface ProviderSettings {
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isEnabled: boolean;
  isDefault: boolean;
}

export interface TranslationPreferences {
  tone?: 'professional' | 'casual' | 'friendly' | 'neutral';
  formality?: 'formal' | 'informal' | 'neutral';
}

export interface ShopSettings {
  shopId: string;
  providers: ProviderSettings[];
  preferences: TranslationPreferences;
  sourceLanguage?: string; // Default source language locale
  targetLanguages: string[]; // Enabled target language locales
}

export interface UpdateProviderSettingsInput {
  shopId: string;
  provider: 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isEnabled?: boolean;
  isDefault?: boolean;
}

export interface UpdatePreferencesInput {
  shopId: string;
  tone?: string;
  formality?: string;
}

export class SettingsValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

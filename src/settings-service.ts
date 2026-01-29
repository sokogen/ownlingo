import { PrismaClient } from '@prisma/client';
import {
  ShopSettings,
  ProviderSettings,
  UpdateProviderSettingsInput,
  UpdatePreferencesInput,
  SettingsValidationError,
} from './types/settings';

export class SettingsService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get all settings for a shop
   */
  async getShopSettings(shopId: string): Promise<ShopSettings> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        aiProviderConfigs: true,
        languages: {
          where: { isEnabled: true },
          orderBy: { isDefault: 'desc' },
        },
      },
    });

    if (!shop) {
      throw new Error(`Shop not found: ${shopId}`);
    }

    const providers: ProviderSettings[] = shop.aiProviderConfigs.map((config) => ({
      provider: config.provider as 'openai' | 'anthropic' | 'google',
      apiKey: config.apiKey,
      model: config.model || undefined,
      maxTokens: config.maxTokens || undefined,
      temperature: config.temperature || undefined,
      isEnabled: config.isEnabled,
      isDefault: config.isDefault,
    }));

    const sourceLanguage = shop.languages.find((lang) => lang.isDefault)?.locale;
    const targetLanguages = shop.languages
      .filter((lang) => !lang.isDefault)
      .map((lang) => lang.locale);

    return {
      shopId: shop.id,
      providers,
      preferences: {
        tone: shop.defaultTone as any,
        formality: shop.defaultFormality as any,
      },
      sourceLanguage,
      targetLanguages,
    };
  }

  /**
   * Update or create provider settings
   */
  async updateProviderSettings(input: UpdateProviderSettingsInput): Promise<ProviderSettings> {
    this.validateProviderSettings(input);

    // If setting as default, unset other defaults first
    if (input.isDefault) {
      await this.prisma.aIProviderConfig.updateMany({
        where: {
          shopId: input.shopId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const config = await this.prisma.aIProviderConfig.upsert({
      where: {
        shopId_provider: {
          shopId: input.shopId,
          provider: input.provider,
        },
      },
      update: {
        ...(input.apiKey !== undefined && { apiKey: input.apiKey }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      },
      create: {
        shopId: input.shopId,
        provider: input.provider,
        apiKey: input.apiKey || '',
        model: input.model,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        isEnabled: input.isEnabled ?? true,
        isDefault: input.isDefault ?? false,
      },
    });

    return {
      provider: config.provider as 'openai' | 'anthropic' | 'google',
      apiKey: config.apiKey,
      model: config.model || undefined,
      maxTokens: config.maxTokens || undefined,
      temperature: config.temperature || undefined,
      isEnabled: config.isEnabled,
      isDefault: config.isDefault,
    };
  }

  /**
   * Update translation preferences
   */
  async updatePreferences(input: UpdatePreferencesInput): Promise<void> {
    await this.prisma.shop.update({
      where: { id: input.shopId },
      data: {
        ...(input.tone !== undefined && { defaultTone: input.tone }),
        ...(input.formality !== undefined && { defaultFormality: input.formality }),
      },
    });
  }

  /**
   * Validate API key format
   */
  private validateProviderSettings(input: UpdateProviderSettingsInput): void {
    if (!['openai', 'anthropic', 'google'].includes(input.provider)) {
      throw new SettingsValidationError(
        'Provider must be one of: openai, anthropic, google',
        'provider'
      );
    }

    // API key validation
    if (input.apiKey !== undefined) {
      if (!input.apiKey || input.apiKey.trim().length === 0) {
        throw new SettingsValidationError('API key cannot be empty', 'apiKey');
      }

      // Basic format validation
      switch (input.provider) {
        case 'openai':
          if (!input.apiKey.startsWith('sk-')) {
            throw new SettingsValidationError(
              'OpenAI API key must start with "sk-"',
              'apiKey'
            );
          }
          break;
        case 'anthropic':
          if (!input.apiKey.startsWith('sk-ant-')) {
            throw new SettingsValidationError(
              'Anthropic API key must start with "sk-ant-"',
              'apiKey'
            );
          }
          break;
        case 'google':
          // Google API keys can have various formats, just check non-empty
          if (input.apiKey.length < 10) {
            throw new SettingsValidationError(
              'Google API key appears to be invalid',
              'apiKey'
            );
          }
          break;
      }
    }

    // Temperature validation
    if (input.temperature !== undefined) {
      if (input.temperature < 0 || input.temperature > 2) {
        throw new SettingsValidationError(
          'Temperature must be between 0 and 2',
          'temperature'
        );
      }
    }

    // Max tokens validation
    if (input.maxTokens !== undefined) {
      if (input.maxTokens <= 0) {
        throw new SettingsValidationError('Max tokens must be positive', 'maxTokens');
      }
    }
  }

  /**
   * Delete provider configuration
   */
  async deleteProviderSettings(shopId: string, provider: string): Promise<void> {
    await this.prisma.aIProviderConfig.delete({
      where: {
        shopId_provider: {
          shopId,
          provider,
        },
      },
    });
  }

  /**
   * Get default provider for a shop
   */
  async getDefaultProvider(shopId: string): Promise<ProviderSettings | null> {
    const config = await this.prisma.aIProviderConfig.findFirst({
      where: {
        shopId,
        isDefault: true,
        isEnabled: true,
      },
    });

    if (!config) {
      return null;
    }

    return {
      provider: config.provider as 'openai' | 'anthropic' | 'google',
      apiKey: config.apiKey,
      model: config.model || undefined,
      maxTokens: config.maxTokens || undefined,
      temperature: config.temperature || undefined,
      isEnabled: config.isEnabled,
      isDefault: config.isDefault,
    };
  }
}

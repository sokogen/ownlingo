import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../settings-service';
import { SettingsValidationError } from '../types/settings';

// Mock PrismaClient
const mockPrisma = {
  shop: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  aIProviderConfig: {
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
} as unknown as PrismaClient;

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    service = new SettingsService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('getShopSettings', () => {
    it('should return shop settings with all providers and preferences', async () => {
      const mockShop = {
        id: 'shop-1',
        domain: 'test.myshopify.com',
        defaultTone: 'professional',
        defaultFormality: 'formal',
        aiProviderConfigs: [
          {
            provider: 'openai',
            apiKey: 'sk-test-key',
            model: 'gpt-4',
            isEnabled: true,
            isDefault: true,
            maxTokens: null,
            temperature: null,
          },
          {
            provider: 'anthropic',
            apiKey: 'sk-ant-test-key',
            model: 'claude-3-opus',
            isEnabled: true,
            isDefault: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
        ],
        languages: [
          { locale: 'en', isDefault: true, isEnabled: true },
          { locale: 'fr', isDefault: false, isEnabled: true },
          { locale: 'de', isDefault: false, isEnabled: true },
        ],
      };

      (mockPrisma.shop.findUnique as jest.Mock).mockResolvedValue(mockShop);

      const result = await service.getShopSettings('shop-1');

      expect(result).toEqual({
        shopId: 'shop-1',
        providers: [
          {
            provider: 'openai',
            apiKey: 'sk-test-key',
            model: 'gpt-4',
            isEnabled: true,
            isDefault: true,
            maxTokens: undefined,
            temperature: undefined,
          },
          {
            provider: 'anthropic',
            apiKey: 'sk-ant-test-key',
            model: 'claude-3-opus',
            isEnabled: true,
            isDefault: false,
            maxTokens: 4096,
            temperature: 0.7,
          },
        ],
        preferences: {
          tone: 'professional',
          formality: 'formal',
        },
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'de'],
      });
    });

    it('should throw error if shop not found', async () => {
      (mockPrisma.shop.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getShopSettings('non-existent')).rejects.toThrow(
        'Shop not found: non-existent'
      );
    });
  });

  describe('updateProviderSettings', () => {
    it('should create new provider config', async () => {
      const mockConfig = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        isEnabled: true,
        isDefault: true,
        maxTokens: null,
        temperature: null,
      };

      (mockPrisma.aIProviderConfig.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockPrisma.aIProviderConfig.upsert as jest.Mock).mockResolvedValue(mockConfig);

      const result = await service.updateProviderSettings({
        shopId: 'shop-1',
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        isDefault: true,
      });

      expect(result.provider).toBe('openai');
      expect(result.apiKey).toBe('sk-test-key');
      expect(result.isDefault).toBe(true);

      // Should unset other defaults
      expect(mockPrisma.aIProviderConfig.updateMany).toHaveBeenCalledWith({
        where: {
          shopId: 'shop-1',
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    });

    it('should update existing provider config', async () => {
      const mockConfig = {
        provider: 'anthropic',
        apiKey: 'sk-ant-updated-key',
        model: 'claude-3-sonnet',
        isEnabled: true,
        isDefault: false,
        maxTokens: 2048,
        temperature: 0.5,
      };

      (mockPrisma.aIProviderConfig.upsert as jest.Mock).mockResolvedValue(mockConfig);

      const result = await service.updateProviderSettings({
        shopId: 'shop-1',
        provider: 'anthropic',
        apiKey: 'sk-ant-updated-key',
        model: 'claude-3-sonnet',
        maxTokens: 2048,
        temperature: 0.5,
      });

      expect(result.provider).toBe('anthropic');
      expect(result.apiKey).toBe('sk-ant-updated-key');
      expect(result.maxTokens).toBe(2048);
      expect(result.temperature).toBe(0.5);
    });

    it('should validate OpenAI API key format', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'openai',
          apiKey: 'invalid-key',
        })
      ).rejects.toThrow(SettingsValidationError);
    });

    it('should validate Anthropic API key format', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'anthropic',
          apiKey: 'invalid-key',
        })
      ).rejects.toThrow(SettingsValidationError);
    });

    it('should validate Google API key is not empty', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'google',
          apiKey: 'short',
        })
      ).rejects.toThrow(SettingsValidationError);
    });

    it('should validate temperature range', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'openai',
          apiKey: 'sk-valid-key',
          temperature: 3.0,
        })
      ).rejects.toThrow(SettingsValidationError);

      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'openai',
          apiKey: 'sk-valid-key',
          temperature: -1.0,
        })
      ).rejects.toThrow(SettingsValidationError);
    });

    it('should validate max tokens is positive', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'openai',
          apiKey: 'sk-valid-key',
          maxTokens: -100,
        })
      ).rejects.toThrow(SettingsValidationError);
    });

    it('should validate provider is one of allowed values', async () => {
      await expect(
        service.updateProviderSettings({
          shopId: 'shop-1',
          provider: 'invalid-provider' as any,
          apiKey: 'sk-test-key',
        })
      ).rejects.toThrow(SettingsValidationError);
    });
  });

  describe('updatePreferences', () => {
    it('should update translation preferences', async () => {
      (mockPrisma.shop.update as jest.Mock).mockResolvedValue({
        id: 'shop-1',
        defaultTone: 'casual',
        defaultFormality: 'informal',
      });

      await service.updatePreferences({
        shopId: 'shop-1',
        tone: 'casual',
        formality: 'informal',
      });

      expect(mockPrisma.shop.update).toHaveBeenCalledWith({
        where: { id: 'shop-1' },
        data: {
          defaultTone: 'casual',
          defaultFormality: 'informal',
        },
      });
    });

    it('should update only specified preferences', async () => {
      (mockPrisma.shop.update as jest.Mock).mockResolvedValue({
        id: 'shop-1',
        defaultTone: 'professional',
      });

      await service.updatePreferences({
        shopId: 'shop-1',
        tone: 'professional',
      });

      expect(mockPrisma.shop.update).toHaveBeenCalledWith({
        where: { id: 'shop-1' },
        data: {
          defaultTone: 'professional',
        },
      });
    });
  });

  describe('deleteProviderSettings', () => {
    it('should delete provider configuration', async () => {
      (mockPrisma.aIProviderConfig.delete as jest.Mock).mockResolvedValue({});

      await service.deleteProviderSettings('shop-1', 'openai');

      expect(mockPrisma.aIProviderConfig.delete).toHaveBeenCalledWith({
        where: {
          shopId_provider: {
            shopId: 'shop-1',
            provider: 'openai',
          },
        },
      });
    });
  });

  describe('getDefaultProvider', () => {
    it('should return default provider if exists', async () => {
      const mockConfig = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        isEnabled: true,
        isDefault: true,
        maxTokens: null,
        temperature: null,
      };

      (mockPrisma.aIProviderConfig.findFirst as jest.Mock).mockResolvedValue(mockConfig);

      const result = await service.getDefaultProvider('shop-1');

      expect(result).toEqual({
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        isEnabled: true,
        isDefault: true,
        maxTokens: undefined,
        temperature: undefined,
      });
    });

    it('should return null if no default provider', async () => {
      (mockPrisma.aIProviderConfig.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getDefaultProvider('shop-1');

      expect(result).toBeNull();
    });
  });
});

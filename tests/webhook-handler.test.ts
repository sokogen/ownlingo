import { PrismaClient } from '@prisma/client';
import { WebhookHandler } from '../src/webhooks/handler';
import { ShopifyContentFetcher } from '../src/shopify/fetcher';
import { ShopifyGraphQLClient } from '../src/shopify/client';
import { ContentHashRepository } from '../src/db/content-hash';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      contentHash: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      translation: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    })),
  };
});

// Mock ContentHashRepository
const mockContentRepoUpsert = jest.fn();
jest.mock('../src/db/content-hash', () => {
  return {
    ContentHashRepository: jest.fn().mockImplementation(() => ({
      upsertContentHash: mockContentRepoUpsert,
    })),
  };
});

// Mock Shopify client
const mockClient = {
  query: jest.fn(),
} as unknown as ShopifyGraphQLClient;

const fetcher = new ShopifyContentFetcher(mockClient);

describe('WebhookHandler', () => {
  let prisma: jest.Mocked<PrismaClient>;
  const shopId = 'test-shop-123';

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
  });

  describe('handleWebhook - products/update', () => {
    it('should process product update webhook', async () => {
      const payload = {
        id: 12345,
        admin_graphql_api_id: 'gid://shopify/Product/12345',
        title: 'Test Product',
      };

      mockClient.query = jest.fn().mockResolvedValue({
        product: {
          id: 'gid://shopify/Product/12345',
          title: 'Test Product',
          description: 'Test description',
          descriptionHtml: '<p>Test description</p>',
          seo: {
            title: 'SEO Title',
            description: 'SEO Description',
          },
        },
      });

      mockContentRepoUpsert
        .mockResolvedValueOnce({
          id: 'hash-1',
          hasChanged: true,
        })
        .mockResolvedValueOnce({
          id: 'hash-2',
          hasChanged: true,
        })
        .mockResolvedValueOnce({
          id: 'hash-3',
          hasChanged: true,
        })
        .mockResolvedValueOnce({
          id: 'hash-4',
          hasChanged: true,
        });

      prisma.translation.findMany = jest.fn().mockResolvedValue([]);

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('products/update', payload);

      expect(result.success).toBe(true);
      expect(result.resourceType).toBe('PRODUCT');
      expect(result.resourceId).toBe(payload.admin_graphql_api_id);
      expect(result.hasChanged).toBe(true);
    });

    it('should detect no changes when content is unchanged', async () => {
      const payload = {
        id: 12346,
        admin_graphql_api_id: 'gid://shopify/Product/12346',
        title: 'Another Product',
      };

      mockClient.query = jest.fn().mockResolvedValue({
        product: {
          id: 'gid://shopify/Product/12346',
          title: 'Another Product',
          description: 'Original description',
        },
      });

      mockContentRepoUpsert.mockResolvedValue({
        id: 'hash-1',
        hasChanged: false,
      });

      prisma.translation.findMany = jest.fn().mockResolvedValue([]);

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('products/update', payload);

      expect(result.success).toBe(true);
      expect(result.hasChanged).toBe(false);
    });

    it('should find affected translations when content changes', async () => {
      const payload = {
        id: 12347,
        admin_graphql_api_id: 'gid://shopify/Product/12347',
        title: 'Product with translations',
      };

      mockClient.query = jest.fn().mockResolvedValue({
        product: {
          id: 'gid://shopify/Product/12347',
          title: 'Product with translations',
          description: 'Updated description',
        },
      });

      mockContentRepoUpsert.mockResolvedValue({
        id: 'hash-1',
        hasChanged: true,
      });

      prisma.translation.findMany = jest.fn().mockResolvedValue([
        {
          id: 'trans-1',
          contentHashId: 'hash-1',
          languageId: 'lang-fr',
          status: 'COMPLETED',
        },
        {
          id: 'trans-2',
          contentHashId: 'hash-1',
          languageId: 'lang-es',
          status: 'COMPLETED',
        },
      ]);

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('products/update', payload);

      expect(result.affectedTranslations).toBe(2);
    });
  });

  describe('handleWebhook - collections/update', () => {
    it('should process collection update webhook', async () => {
      const payload = {
        id: 67890,
        admin_graphql_api_id: 'gid://shopify/Collection/67890',
        title: 'Test Collection',
      };

      mockClient.query = jest.fn().mockResolvedValue({
        collection: {
          id: 'gid://shopify/Collection/67890',
          title: 'Test Collection',
          description: 'Test collection description',
          seo: {
            title: 'Collection SEO',
            description: 'Collection SEO Description',
          },
        },
      });

      mockContentRepoUpsert.mockResolvedValue({
        id: 'hash-1',
        hasChanged: true,
      });

      prisma.translation.findMany = jest.fn().mockResolvedValue([]);

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('collections/update', payload);

      expect(result.success).toBe(true);
      expect(result.resourceType).toBe('COLLECTION');
      expect(result.resourceId).toBe(payload.admin_graphql_api_id);
    });
  });

  describe('handleWebhook - delete webhooks', () => {
    it('should handle product deletion', async () => {
      const payload = {
        id: 99999,
        admin_graphql_api_id: 'gid://shopify/Product/99999',
      };

      prisma.contentHash.deleteMany = jest.fn().mockResolvedValue({ count: 3 });

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('products/delete', payload);

      expect(result.success).toBe(true);
      expect(result.resourceType).toBe('PRODUCT');
      expect(prisma.contentHash.deleteMany).toHaveBeenCalledWith({
        where: {
          shopId,
          resourceType: 'product',
          resourceId: payload.admin_graphql_api_id,
        },
      });
    });
  });

  describe('autoTriggerTranslation', () => {
    it('should queue translations when auto-trigger is enabled', async () => {
      const handlerWithAutoTrigger = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: true,
      });

      const payload = {
        id: 88888,
        admin_graphql_api_id: 'gid://shopify/Product/88888',
        title: 'Auto-trigger product',
      };

      mockClient.query = jest.fn().mockResolvedValue({
        product: {
          id: 'gid://shopify/Product/88888',
          title: 'Auto-trigger product',
          description: 'Updated description',
        },
      });

      mockContentRepoUpsert.mockResolvedValue({
        id: 'hash-1',
        hasChanged: true,
      });

      prisma.translation.findMany = jest.fn().mockResolvedValue([
        {
          id: 'trans-1',
          contentHashId: 'hash-1',
          languageId: 'lang-es',
          status: 'COMPLETED',
        },
      ]);

      prisma.translation.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const result = await handlerWithAutoTrigger.handleWebhook(
        'products/update',
        payload
      );

      expect(result.affectedTranslations).toBe(1);
      expect(prisma.translation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['trans-1'] } },
        data: {
          status: 'PENDING',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const payload = {
        id: 77777,
        admin_graphql_api_id: 'gid://shopify/Product/77777',
      };

      mockClient.query = jest.fn().mockRejectedValue(new Error('API Error'));

      const handler = new WebhookHandler(prisma, fetcher, {
        shopId,
        autoTriggerTranslation: false,
      });

      const result = await handler.handleWebhook('products/update', payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });
});

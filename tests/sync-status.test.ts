import { PrismaClient, TranslationStatus } from '@prisma/client';
import { SyncStatusService } from '../src/sync/status';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      language: {
        findUnique: jest.fn(),
      },
      contentHash: {
        findMany: jest.fn(),
      },
    })),
    TranslationStatus: {
      PENDING: 'PENDING',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      NEEDS_REVIEW: 'NEEDS_REVIEW',
    },
  };
});

describe('SyncStatusService', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let service: SyncStatusService;

  beforeEach(() => {
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    service = new SyncStatusService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getShopSyncStatus', () => {
    it('should return pending status for content without translation', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Test Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getShopSyncStatus('shop-1', 'fr');

      expect(result).toHaveLength(1);
      expect(result[0].syncStatus).toBe('pending');
      expect(result[0].contentHashId).toBe('hash-1');
      expect(result[0].locale).toBe('fr');
    });

    it('should return synced status for completed translation with matching hash', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Test Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-1',
              sourceContentHash: 'abc123',
              translatedText: 'Produit Test',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getShopSyncStatus('shop-1', 'fr');

      expect(result).toHaveLength(1);
      expect(result[0].syncStatus).toBe('synced');
      expect(result[0].translationId).toBe('trans-1');
    });

    it('should return outdated status when source hash differs from current hash', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'xyz789', // Current hash changed
          content: 'Updated Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-1',
              sourceContentHash: 'abc123', // Old hash
              translatedText: 'Produit Test',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getShopSyncStatus('shop-1', 'fr');

      expect(result).toHaveLength(1);
      expect(result[0].syncStatus).toBe('outdated');
      expect(result[0].translationId).toBe('trans-1');
    });

    it('should return error status for failed translations', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Test Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-1',
              sourceContentHash: 'abc123',
              translatedText: '',
              status: 'FAILED' as TranslationStatus,
              aiProvider: 'openai',
              aiModel: 'gpt-4',
              tokensUsed: null,
              errorMessage: 'API rate limit exceeded',
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getShopSyncStatus('shop-1', 'fr');

      expect(result).toHaveLength(1);
      expect(result[0].syncStatus).toBe('error');
      expect(result[0].errorMessage).toBe('API rate limit exceeded');
    });
  });

  describe('findUntranslated', () => {
    it('should return only pending content', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Test Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
        {
          id: 'hash-2',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/2',
          fieldName: 'title',
          hash: 'def456',
          content: 'Another Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-2',
              sourceContentHash: 'def456',
              translatedText: 'Autre Produit',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.findUntranslated('shop-1', 'fr');

      expect(result).toHaveLength(1);
      expect(result[0].contentHashId).toBe('hash-1');
      expect(result[0].syncStatus).toBe('pending');
    });
  });

  describe('getAggregation', () => {
    it('should return correct counts for each status', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Product 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
        {
          id: 'hash-2',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/2',
          fieldName: 'title',
          hash: 'def456',
          content: 'Product 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-2',
              sourceContentHash: 'def456',
              translatedText: 'Produit 2',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
        {
          id: 'hash-3',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/3',
          fieldName: 'title',
          hash: 'ghi789',
          content: 'Product 3',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-2',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-3',
              sourceContentHash: 'old-hash',
              translatedText: 'Produit 3',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
        {
          id: 'hash-4',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/4',
          fieldName: 'title',
          hash: 'jkl012',
          content: 'Product 4',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-3',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-4',
              sourceContentHash: 'jkl012',
              translatedText: '',
              status: 'FAILED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: 'Error',
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getAggregation('shop-1', 'fr');

      expect(result.total).toBe(4);
      expect(result.pending).toBe(1);
      expect(result.synced).toBe(1);
      expect(result.outdated).toBe(1);
      expect(result.error).toBe(1);
    });
  });

  describe('getAggregationByType', () => {
    it('should return counts grouped by resource type', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Product',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
        {
          id: 'hash-2',
          shopId: 'shop-1',
          resourceType: 'collection',
          resourceId: 'gid://shopify/Collection/1',
          fieldName: 'title',
          hash: 'def456',
          content: 'Collection',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-2',
              sourceContentHash: 'def456',
              translatedText: 'Collection FR',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getAggregationByType('shop-1', 'fr');

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.resourceType === 'product')).toBeDefined();
      expect(result.find((r) => r.resourceType === 'collection')).toBeDefined();

      const productAgg = result.find((r) => r.resourceType === 'product')!;
      expect(productAgg.aggregation.pending).toBe(1);
      expect(productAgg.aggregation.total).toBe(1);

      const collectionAgg = result.find((r) => r.resourceType === 'collection')!;
      expect(collectionAgg.aggregation.synced).toBe(1);
      expect(collectionAgg.aggregation.total).toBe(1);
    });
  });

  describe('getProgress', () => {
    it('should return 0 for empty shop', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getProgress('shop-1', 'fr');

      expect(result).toBe(0);
    });

    it('should return correct progress percentage', async () => {
      const mockLanguage = {
        id: 'lang-1',
        shopId: 'shop-1',
        locale: 'fr',
        name: 'French',
        isDefault: false,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 2 synced out of 4 total = 50%
      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: '1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'P1',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-1',
              sourceContentHash: 'abc123',
              translatedText: 'P1 FR',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
        {
          id: 'hash-2',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: '2',
          fieldName: 'title',
          hash: 'def456',
          content: 'P2',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-2',
              shopId: 'shop-1',
              languageId: 'lang-1',
              contentHashId: 'hash-2',
              sourceContentHash: 'def456',
              translatedText: 'P2 FR',
              status: 'COMPLETED' as TranslationStatus,
              aiProvider: null,
              aiModel: null,
              tokensUsed: null,
              errorMessage: null,
              translationJobId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
        {
          id: 'hash-3',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: '3',
          fieldName: 'title',
          hash: 'ghi789',
          content: 'P3',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
        {
          id: 'hash-4',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: '4',
          fieldName: 'title',
          hash: 'jkl012',
          content: 'P4',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [],
        },
      ];

      (prisma.language.findUnique as jest.Mock).mockResolvedValue(mockLanguage);
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockContentHashes);

      const result = await service.getProgress('shop-1', 'fr');

      expect(result).toBe(50);
    });
  });
});

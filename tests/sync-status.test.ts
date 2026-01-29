import { PrismaClient, TranslationStatus } from '@prisma/client';
import { SyncStatusRepository } from '../src/db/sync-status';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      translation: {
        findMany: jest.fn(),
      },
      contentHash: {
        findMany: jest.fn(),
      },
      language: {
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

describe('SyncStatusRepository', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let repository: SyncStatusRepository;

  beforeEach(() => {
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    repository = new SyncStatusRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOutdatedTranslations', () => {
    it('should return translations where content was updated after translation', async () => {
      const oldDate = new Date('2024-01-01T00:00:00Z');
      const newDate = new Date('2024-01-02T00:00:00Z');

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: 'Titre Original',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          createdAt: oldDate,
          updatedAt: oldDate,
          contentHash: {
            id: 'hash-1',
            shopId: 'shop-1',
            resourceType: 'product',
            resourceId: 'gid://shopify/Product/1',
            fieldName: 'title',
            hash: 'abc123',
            content: 'Updated Title',
            createdAt: oldDate,
            updatedAt: newDate, // Content updated after translation
          },
          language: {
            id: 'lang-fr',
            shopId: 'shop-1',
            locale: 'fr',
            name: 'French',
            isDefault: false,
            isEnabled: true,
            createdAt: oldDate,
            updatedAt: oldDate,
          },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations
      );

      const result = await repository.getOutdatedTranslations('shop-1');

      expect(result).toHaveLength(1);
      expect(result[0].translationId).toBe('trans-1');
      expect(result[0].syncStatus).toBe('outdated');
      expect(result[0].locale).toBe('fr');
      expect(result[0].resourceType).toBe('product');
    });

    it('should filter translations by locale', async () => {
      (prisma.translation.findMany as jest.Mock).mockResolvedValue([]);

      await repository.getOutdatedTranslations('shop-1', 'fr');

      expect(prisma.translation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop-1',
            language: { locale: 'fr' },
          }),
        })
      );
    });

    it('should filter translations by resource type', async () => {
      (prisma.translation.findMany as jest.Mock).mockResolvedValue([]);

      await repository.getOutdatedTranslations('shop-1', undefined, 'product');

      expect(prisma.translation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop-1',
            contentHash: { resourceType: 'product' },
          }),
        })
      );
    });
  });

  describe('getUntranslatedContent', () => {
    it('should find content missing translations in specified locales', async () => {
      const mockContentHashes = [
        {
          id: 'hash-1',
          shopId: 'shop-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'abc123',
          content: 'Product Title',
          createdAt: new Date(),
          updatedAt: new Date(),
          translations: [
            {
              id: 'trans-1',
              language: { locale: 'fr' },
            },
          ],
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
          translations: [], // No translations
        },
      ];

      const mockLanguages = [
        {
          id: 'lang-fr',
          shopId: 'shop-1',
          locale: 'fr',
          name: 'French',
          isEnabled: true,
        },
        {
          id: 'lang-es',
          shopId: 'shop-1',
          locale: 'es',
          name: 'Spanish',
          isEnabled: true,
        },
      ];

      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(
        mockContentHashes
      );
      (prisma.language.findMany as jest.Mock).mockResolvedValue(mockLanguages);

      const result = await repository.getUntranslatedContent('shop-1', [
        'fr',
        'es',
      ]);

      // hash-1 is missing 'es', hash-2 is missing both 'fr' and 'es'
      expect(result.length).toBeGreaterThan(0);

      const hash1Result = result.find((r) => r.contentHashId === 'hash-1');
      expect(hash1Result?.missingLocales).toContain('es');
      expect(hash1Result?.missingLocales).not.toContain('fr');

      const hash2Result = result.find((r) => r.contentHashId === 'hash-2');
      expect(hash2Result?.missingLocales).toContain('fr');
      expect(hash2Result?.missingLocales).toContain('es');
    });

    it('should filter by resource type', async () => {
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.language.findMany as jest.Mock).mockResolvedValue([]);

      await repository.getUntranslatedContent(
        'shop-1',
        ['fr', 'es'],
        'product'
      );

      expect(prisma.contentHash.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop-1',
            resourceType: 'product',
          }),
        })
      );
    });
  });

  describe('getAllSyncStatuses', () => {
    it('should return sync status for all translations', async () => {
      const now = new Date();

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: 'Translated',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          contentHash: {
            id: 'hash-1',
            resourceType: 'product',
            resourceId: 'gid://shopify/Product/1',
            fieldName: 'title',
            updatedAt: now,
          },
          language: {
            id: 'lang-fr',
            locale: 'fr',
          },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations
      );

      const result = await repository.getAllSyncStatuses('shop-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('syncStatus');
      expect(result[0]).toHaveProperty('translationId');
      expect(result[0]).toHaveProperty('locale');
      expect(result[0]).toHaveProperty('resourceType');
    });

    it('should identify synced status correctly', async () => {
      const now = new Date();

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: 'Translated',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          contentHash: {
            updatedAt: now, // Same timestamp - synced
          },
          language: { locale: 'fr' },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations as any
      );

      const result = await repository.getAllSyncStatuses('shop-1');
      expect(result[0].syncStatus).toBe('synced');
    });

    it('should identify outdated status correctly', async () => {
      const oldDate = new Date('2024-01-01T00:00:00Z');
      const newDate = new Date('2024-01-02T00:00:00Z');

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: 'Translated',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          createdAt: oldDate,
          updatedAt: oldDate,
          contentHash: {
            updatedAt: newDate, // Content newer - outdated
          },
          language: { locale: 'fr' },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations as any
      );

      const result = await repository.getAllSyncStatuses('shop-1');
      expect(result[0].syncStatus).toBe('outdated');
    });

    it('should identify pending status correctly', async () => {
      const now = new Date();

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: '',
          status: 'PENDING' as TranslationStatus,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          contentHash: { updatedAt: now },
          language: { locale: 'fr' },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations as any
      );

      const result = await repository.getAllSyncStatuses('shop-1');
      expect(result[0].syncStatus).toBe('pending');
    });

    it('should identify error status correctly', async () => {
      const now = new Date();

      const mockTranslations = [
        {
          id: 'trans-1',
          shopId: 'shop-1',
          languageId: 'lang-fr',
          contentHashId: 'hash-1',
          translatedText: '',
          status: 'FAILED' as TranslationStatus,
          errorMessage: 'API error',
          createdAt: now,
          updatedAt: now,
          contentHash: { updatedAt: now },
          language: { locale: 'fr' },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations as any
      );

      const result = await repository.getAllSyncStatuses('shop-1');
      expect(result[0].syncStatus).toBe('error');
    });
  });

  describe('getSyncAggregation', () => {
    it('should return correct counts for each sync status', async () => {
      const oldDate = new Date('2024-01-01T00:00:00Z');
      const newDate = new Date('2024-01-02T00:00:00Z');

      const mockTranslations = [
        {
          id: 'trans-1',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          updatedAt: newDate,
          contentHash: { updatedAt: newDate },
          language: { locale: 'fr' },
        },
        {
          id: 'trans-2',
          status: 'COMPLETED' as TranslationStatus,
          errorMessage: null,
          updatedAt: oldDate,
          contentHash: { updatedAt: newDate }, // Outdated
          language: { locale: 'fr' },
        },
        {
          id: 'trans-3',
          status: 'PENDING' as TranslationStatus,
          errorMessage: null,
          updatedAt: newDate,
          contentHash: { updatedAt: newDate },
          language: { locale: 'fr' },
        },
        {
          id: 'trans-4',
          status: 'FAILED' as TranslationStatus,
          errorMessage: 'Error',
          updatedAt: newDate,
          contentHash: { updatedAt: newDate },
          language: { locale: 'fr' },
        },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations as any
      );

      const result = await repository.getSyncAggregation('shop-1');

      expect(result.total).toBe(4);
      expect(result.synced).toBe(1);
      expect(result.outdated).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.error).toBe(1);
    });

    it('should include filter parameters in result', async () => {
      (prisma.translation.findMany as jest.Mock).mockResolvedValue([]);

      const result = await repository.getSyncAggregation(
        'shop-1',
        'fr',
        'product'
      );

      expect(result.shopId).toBe('shop-1');
      expect(result.locale).toBe('fr');
      expect(result.resourceType).toBe('product');
    });
  });

  describe('getSyncAggregationByLocale', () => {
    it('should return aggregations grouped by locale', async () => {
      const mockLanguages = [
        {
          id: 'lang-fr',
          shopId: 'shop-1',
          locale: 'fr',
          name: 'French',
          isEnabled: true,
        },
        {
          id: 'lang-es',
          shopId: 'shop-1',
          locale: 'es',
          name: 'Spanish',
          isEnabled: true,
        },
      ];

      (prisma.language.findMany as jest.Mock).mockResolvedValue(mockLanguages);
      (prisma.translation.findMany as jest.Mock).mockResolvedValue([]);

      const result = await repository.getSyncAggregationByLocale('shop-1');

      expect(result.size).toBe(2);
      expect(result.has('fr')).toBe(true);
      expect(result.has('es')).toBe(true);
    });
  });

  describe('getSyncAggregationByResourceType', () => {
    it('should return aggregations grouped by resource type', async () => {
      const mockContentHashes = [
        { resourceType: 'product' },
        { resourceType: 'collection' },
      ];

      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(
        mockContentHashes
      );
      (prisma.translation.findMany as jest.Mock).mockResolvedValue([]);

      const result = await repository.getSyncAggregationByResourceType(
        'shop-1'
      );

      expect(result.size).toBe(2);
      expect(result.has('product')).toBe(true);
      expect(result.has('collection')).toBe(true);
    });
  });

  describe('markTranslationsAsOutdated', () => {
    it('should count completed translations for content hash', async () => {
      const mockTranslations = [
        { id: 'trans-1', status: 'COMPLETED' as TranslationStatus },
        { id: 'trans-2', status: 'COMPLETED' as TranslationStatus },
        { id: 'trans-3', status: 'PENDING' as TranslationStatus },
      ];

      (prisma.translation.findMany as jest.Mock).mockResolvedValue(
        mockTranslations
      );

      const result = await repository.markTranslationsAsOutdated('hash-1');

      expect(result.updated).toBe(3);
      expect(prisma.translation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contentHashId: 'hash-1',
            status: 'COMPLETED',
          }),
        })
      );
    });
  });
});

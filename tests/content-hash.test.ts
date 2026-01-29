import { PrismaClient } from '@prisma/client';
import { ContentHashRepository } from '../src/db/content-hash';
import { TranslatableResource } from '../src/shopify/fetcher';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      contentHash: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    })),
  };
});

describe('ContentHashRepository', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let repository: ContentHashRepository;

  beforeEach(() => {
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    repository = new ContentHashRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertContentHash', () => {
    it('should create new content hash when none exists', async () => {
      const mockCreated = {
        id: 'hash-1',
        shopId: 'shop-1',
        resourceType: 'product',
        resourceId: 'gid://shopify/Product/1',
        fieldName: 'title',
        hash: expect.any(String),
        content: 'Test Product',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.contentHash.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await repository.upsertContentHash(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        'Test Product'
      );

      expect(result.isNew).toBe(true);
      expect(result.hasChanged).toBe(false);
      expect(prisma.contentHash.create).toHaveBeenCalled();
    });

    it('should detect unchanged content', async () => {
      const existingHash = {
        id: 'hash-1',
        shopId: 'shop-1',
        resourceType: 'product',
        resourceId: 'gid://shopify/Product/1',
        fieldName: 'title',
        hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // SHA-256 of 'test'
        content: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue(existingHash);

      const result = await repository.upsertContentHash(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        'test' // Same content
      );

      expect(result.isNew).toBe(false);
      expect(result.hasChanged).toBe(false);
      expect(prisma.contentHash.update).not.toHaveBeenCalled();
    });

    it('should update when content changes', async () => {
      const existingHash = {
        id: 'hash-1',
        shopId: 'shop-1',
        resourceType: 'product',
        resourceId: 'gid://shopify/Product/1',
        fieldName: 'title',
        hash: 'old-hash',
        content: 'Old Content',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedHash = {
        ...existingHash,
        hash: 'new-hash',
        content: 'New Content',
        updatedAt: new Date(),
      };

      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue(existingHash);
      (prisma.contentHash.update as jest.Mock).mockResolvedValue(updatedHash);

      const result = await repository.upsertContentHash(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        'New Content'
      );

      expect(result.isNew).toBe(false);
      expect(result.hasChanged).toBe(true);
      expect(prisma.contentHash.update).toHaveBeenCalled();
    });
  });

  describe('storeTranslatableResources', () => {
    it('should store multiple translatable resources', async () => {
      const resources: TranslatableResource[] = [
        {
          resourceId: 'gid://shopify/Product/1',
          resourceType: 'PRODUCT',
          translatableContent: [
            {
              key: 'title',
              value: 'Product 1',
              digest: 'abc123',
              locale: 'en',
            },
            {
              key: 'description',
              value: 'Description 1',
              digest: 'def456',
              locale: 'en',
            },
          ],
        },
      ];

      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.contentHash.create as jest.Mock).mockResolvedValue({
        id: 'hash-1',
        hash: 'test-hash',
      });

      const result = await repository.storeTranslatableResources('shop-1', resources);

      expect(result.totalProcessed).toBe(2);
      expect(result.newContent).toBe(2);
      expect(result.changedContent).toBe(0);
      expect(result.unchangedContent).toBe(0);
    });

    it('should track new, changed, and unchanged content', async () => {
      const resources: TranslatableResource[] = [
        {
          resourceId: 'gid://shopify/Product/1',
          resourceType: 'PRODUCT',
          translatableContent: [
            { key: 'field1', value: 'new', digest: 'a', locale: 'en' },
            { key: 'field2', value: 'changed', digest: 'b', locale: 'en' },
            { key: 'field3', value: 'unchanged', digest: 'c', locale: 'en' },
          ],
        },
      ];

      // Mock responses: null (new), existing with different hash (changed), existing with same hash (unchanged)
      (prisma.contentHash.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: '2', hash: 'old-hash' })
        .mockResolvedValueOnce({
          id: '3',
          hash: 'aaa8d3c8d74ad3e8f6b1772aa9c7e0eaa528cb42fc93599ce2f125b00d4c424c', // SHA-256 of 'unchanged'
        });

      (prisma.contentHash.create as jest.Mock).mockResolvedValue({ id: '1', hash: 'new-hash' });
      (prisma.contentHash.update as jest.Mock).mockResolvedValue({ id: '2', hash: 'changed-hash' });

      const result = await repository.storeTranslatableResources('shop-1', resources);

      expect(result.totalProcessed).toBe(3);
      expect(result.newContent).toBe(1);
      expect(result.changedContent).toBe(1);
      expect(result.unchangedContent).toBe(1);
    });
  });

  describe('getContentHashesByShop', () => {
    it('should retrieve all content hashes for a shop', async () => {
      const mockHashes = [
        {
          id: 'hash-1',
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/1',
          fieldName: 'title',
          hash: 'hash1',
          content: 'Content 1',
        },
      ];

      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue(mockHashes);

      const result = await repository.getContentHashesByShop('shop-1');

      expect(result).toEqual(mockHashes);
      expect(prisma.contentHash.findMany).toHaveBeenCalledWith({
        where: { shopId: 'shop-1' },
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          fieldName: true,
          hash: true,
          content: true,
        },
        orderBy: [
          { resourceType: 'asc' },
          { resourceId: 'asc' },
          { fieldName: 'asc' },
        ],
      });
    });

    it('should filter by resource type', async () => {
      (prisma.contentHash.findMany as jest.Mock).mockResolvedValue([]);

      await repository.getContentHashesByShop('shop-1', 'product');

      expect(prisma.contentHash.findMany).toHaveBeenCalledWith({
        where: { shopId: 'shop-1', resourceType: 'product' },
        select: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });
  });

  describe('hasContentChanged', () => {
    it('should return true for new content', async () => {
      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.hasContentChanged(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        'New Content'
      );

      expect(result).toBe(true);
    });

    it('should return true when content has changed', async () => {
      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue({
        id: 'hash-1',
        hash: 'old-hash',
      });

      const result = await repository.hasContentChanged(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        'Changed Content'
      );

      expect(result).toBe(true);
    });

    it('should return false when content is unchanged', async () => {
      const content = 'Unchanged Content';
      const hash = '23d973e9e3085643b175ed9af91b62ddc7c2a652a5ac3e06bf484ba596b1aeb3'; // SHA-256 of 'Unchanged Content'

      (prisma.contentHash.findUnique as jest.Mock).mockResolvedValue({
        id: 'hash-1',
        hash,
      });

      const result = await repository.hasContentChanged(
        'shop-1',
        'product',
        'gid://shopify/Product/1',
        'title',
        content
      );

      expect(result).toBe(false);
    });
  });
});

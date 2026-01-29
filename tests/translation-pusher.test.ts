import { ShopifyGraphQLClient } from '../src/shopify/client';
import { ShopifyTranslationPusher, TranslationBatch, PushProgress } from '../src/shopify/translation-pusher';

// Mock the GraphQL client
jest.mock('../src/shopify/client');

describe('ShopifyTranslationPusher', () => {
  let client: jest.Mocked<ShopifyGraphQLClient>;
  let pusher: ShopifyTranslationPusher;

  beforeEach(() => {
    client = new ShopifyGraphQLClient({
      shopDomain: 'test.myshopify.com',
      accessToken: 'test-token',
    }) as jest.Mocked<ShopifyGraphQLClient>;

    pusher = new ShopifyTranslationPusher(client);
  });

  describe('pushResourceTranslations', () => {
    it('should successfully push translations for a resource', async () => {
      const mockResponse = {
        translationsRegister: {
          userErrors: [],
          translations: [
            {
              key: 'title',
              value: 'Translated Title',
              locale: 'fr',
              outdated: false,
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        },
      };

      client.mutate.mockResolvedValue(mockResponse);

      const result = await pusher.pushResourceTranslations(
        'gid://shopify/Product/123',
        [
          {
            key: 'title',
            value: 'Translated Title',
            locale: 'fr',
          },
        ]
      );

      expect(result.success).toBe(true);
      expect(result.resourceId).toBe('gid://shopify/Product/123');
      expect(result.translationsCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle user errors from Shopify', async () => {
      const mockResponse = {
        translationsRegister: {
          userErrors: [
            {
              message: 'Invalid translation key',
              field: ['translations', '0', 'key'],
            },
          ],
          translations: [],
        },
      };

      client.mutate.mockResolvedValue(mockResponse);

      const result = await pusher.pushResourceTranslations(
        'gid://shopify/Product/123',
        [
          {
            key: 'invalid_key',
            value: 'value',
            locale: 'fr',
          },
        ]
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Invalid translation key');
    });

    it('should retry on failure', async () => {
      client.mutate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          translationsRegister: {
            userErrors: [],
            translations: [{ key: 'title', value: 'Test', locale: 'fr' }],
          },
        });

      const result = await pusher.pushResourceTranslations(
        'gid://shopify/Product/123',
        [{ key: 'title', value: 'Test', locale: 'fr' }],
        { retryAttempts: 3, retryDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(client.mutate).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retry attempts', async () => {
      client.mutate.mockRejectedValue(new Error('Persistent error'));

      const result = await pusher.pushResourceTranslations(
        'gid://shopify/Product/123',
        [{ key: 'title', value: 'Test', locale: 'fr' }],
        { retryAttempts: 2, retryDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Persistent error');
      expect(client.mutate).toHaveBeenCalledTimes(2);
    });
  });

  describe('pushBatch', () => {
    it('should push multiple resources in batches', async () => {
      client.mutate.mockResolvedValue({
        translationsRegister: {
          userErrors: [],
          translations: [],
        },
      });

      const batches: TranslationBatch[] = [
        {
          resourceId: 'gid://shopify/Product/1',
          translations: [{ key: 'title', value: 'Title 1', locale: 'fr' }],
        },
        {
          resourceId: 'gid://shopify/Product/2',
          translations: [{ key: 'title', value: 'Title 2', locale: 'fr' }],
        },
        {
          resourceId: 'gid://shopify/Product/3',
          translations: [{ key: 'title', value: 'Title 3', locale: 'fr' }],
        },
      ];

      const results = await pusher.pushBatch(batches);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should call onProgress callback during batch processing', async () => {
      client.mutate.mockResolvedValue({
        translationsRegister: {
          userErrors: [],
          translations: [],
        },
      });

      const batches: TranslationBatch[] = [
        {
          resourceId: 'gid://shopify/Product/1',
          translations: [{ key: 'title', value: 'Title 1', locale: 'fr' }],
        },
        {
          resourceId: 'gid://shopify/Product/2',
          translations: [{ key: 'title', value: 'Title 2', locale: 'fr' }],
        },
      ];

      const progressUpdates: PushProgress[] = [];
      const onProgress = (progress: PushProgress) => {
        progressUpdates.push(progress);
      };

      await pusher.pushBatch(batches, { onProgress, batchSize: 1 });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    });

    it('should handle mixed success and failure in batch', async () => {
      client.mutate
        .mockResolvedValueOnce({
          translationsRegister: {
            userErrors: [],
            translations: [],
          },
        })
        .mockResolvedValueOnce({
          translationsRegister: {
            userErrors: [{ message: 'Error', field: [] }],
            translations: [],
          },
        });

      const batches: TranslationBatch[] = [
        {
          resourceId: 'gid://shopify/Product/1',
          translations: [{ key: 'title', value: 'Title 1', locale: 'fr' }],
        },
        {
          resourceId: 'gid://shopify/Product/2',
          translations: [{ key: 'title', value: 'Title 2', locale: 'fr' }],
        },
      ];

      const results = await pusher.pushBatch(batches);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('verifyTranslations', () => {
    it('should verify translations match expected values', async () => {
      const mockResponse = {
        translatableResource: {
          resourceId: 'gid://shopify/Product/123',
          translations: [
            {
              key: 'title',
              value: 'Translated Title',
              locale: 'fr',
            },
          ],
        },
      };

      client.query.mockResolvedValue(mockResponse);

      const result = await pusher.verifyTranslations('gid://shopify/Product/123', [
        {
          key: 'title',
          value: 'Translated Title',
          locale: 'fr',
        },
      ]);

      expect(result.verified).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should detect mismatches in translations', async () => {
      const mockResponse = {
        translatableResource: {
          resourceId: 'gid://shopify/Product/123',
          translations: [
            {
              key: 'title',
              value: 'Different Translation',
              locale: 'fr',
            },
          ],
        },
      };

      client.query.mockResolvedValue(mockResponse);

      const result = await pusher.verifyTranslations('gid://shopify/Product/123', [
        {
          key: 'title',
          value: 'Expected Translation',
          locale: 'fr',
        },
      ]);

      expect(result.verified).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].expected).toBe('Expected Translation');
      expect(result.mismatches[0].actual).toBe('Different Translation');
    });

    it('should handle missing translations as mismatches', async () => {
      const mockResponse = {
        translatableResource: {
          resourceId: 'gid://shopify/Product/123',
          translations: [],
        },
      };

      client.query.mockResolvedValue(mockResponse);

      const result = await pusher.verifyTranslations('gid://shopify/Product/123', [
        {
          key: 'title',
          value: 'Expected Translation',
          locale: 'fr',
        },
      ]);

      expect(result.verified).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].actual).toBeNull();
    });
  });

  describe('getSummary', () => {
    it('should calculate correct summary statistics', () => {
      const results = [
        {
          resourceId: 'gid://shopify/Product/1',
          success: true,
          translationsCount: 5,
          errors: [],
        },
        {
          resourceId: 'gid://shopify/Product/2',
          success: true,
          translationsCount: 3,
          errors: [],
        },
        {
          resourceId: 'gid://shopify/Product/3',
          success: false,
          translationsCount: 0,
          errors: [{ message: 'Error', field: [] }],
        },
      ];

      const summary = pusher.getSummary(results);

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.totalTranslations).toBe(8);
      expect(summary.errors).toHaveLength(1);
    });
  });
});

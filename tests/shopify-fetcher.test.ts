import { ShopifyGraphQLClient } from '../src/shopify/client';
import { ShopifyContentFetcher, TranslatableResource } from '../src/shopify/fetcher';

// Mock Shopify GraphQL client
jest.mock('../src/shopify/client');

describe('ShopifyContentFetcher', () => {
  let mockClient: jest.Mocked<ShopifyGraphQLClient>;
  let fetcher: ShopifyContentFetcher;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      getShop: jest.fn().mockReturnValue('test-shop.myshopify.com'),
    } as any;

    fetcher = new ShopifyContentFetcher(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTranslatableResourcesByType', () => {
    it('should fetch products with pagination', async () => {
      const mockResponse1 = {
        translatableResources: {
          edges: [
            {
              node: {
                resourceId: 'gid://shopify/Product/1',
                translatableContent: [
                  {
                    key: 'title',
                    value: 'Product 1',
                    digest: 'abc123',
                    locale: 'en',
                  },
                ],
              },
              cursor: 'cursor1',
            },
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: 'cursor1',
          },
        },
      };

      const mockResponse2 = {
        translatableResources: {
          edges: [
            {
              node: {
                resourceId: 'gid://shopify/Product/2',
                translatableContent: [
                  {
                    key: 'title',
                    value: 'Product 2',
                    digest: 'def456',
                    locale: 'en',
                  },
                ],
              },
              cursor: 'cursor2',
            },
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      };

      mockClient.query
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const resources = await fetcher.fetchTranslatableResourcesByType('PRODUCT', 1, 10);

      expect(resources).toHaveLength(2);
      expect(resources[0].resourceId).toBe('gid://shopify/Product/1');
      expect(resources[1].resourceId).toBe('gid://shopify/Product/2');
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should stop at max pages limit', async () => {
      const mockResponse = {
        translatableResources: {
          edges: [
            {
              node: {
                resourceId: 'gid://shopify/Product/1',
                translatableContent: [
                  {
                    key: 'title',
                    value: 'Product 1',
                    digest: 'abc123',
                    locale: 'en',
                  },
                ],
              },
              cursor: 'cursor1',
            },
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: 'cursor1',
          },
        },
      };

      mockClient.query.mockResolvedValue(mockResponse);

      const resources = await fetcher.fetchTranslatableResourcesByType('PRODUCT', 1, 3);

      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(resources).toHaveLength(3);
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        translatableResources: {
          edges: [],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      };

      mockClient.query.mockResolvedValue(mockResponse);

      const resources = await fetcher.fetchTranslatableResourcesByType('PRODUCT');

      expect(resources).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchAllTranslatableResources', () => {
    it('should fetch all resource types', async () => {
      const mockResponse = {
        translatableResources: {
          edges: [
            {
              node: {
                resourceId: 'gid://shopify/Product/1',
                translatableContent: [
                  {
                    key: 'title',
                    value: 'Test',
                    digest: 'abc',
                    locale: 'en',
                  },
                ],
              },
              cursor: 'cursor1',
            },
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      };

      mockClient.query.mockResolvedValue(mockResponse);

      const resources = await fetcher.fetchAllTranslatableResources({
        resourceTypes: ['PRODUCT', 'COLLECTION'],
        pageSize: 10,
      });

      expect(mockClient.query).toHaveBeenCalledTimes(2); // Once per type
      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('fetchProductDetails', () => {
    it('should fetch product details', async () => {
      const mockProduct = {
        product: {
          id: 'gid://shopify/Product/1',
          title: 'Test Product',
          description: 'Test Description',
        },
      };

      mockClient.query.mockResolvedValue(mockProduct);

      const result = await fetcher.fetchProductDetails('gid://shopify/Product/1');

      expect(result).toEqual(mockProduct);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('getProduct'),
        { id: 'gid://shopify/Product/1' }
      );
    });
  });

  describe('fetchMenus', () => {
    it('should fetch navigation menus', async () => {
      const mockMenus = {
        shop: {
          navigationMenus: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Menu/1',
                  title: 'Main Menu',
                  items: [
                    { id: '1', title: 'Home', url: '/' },
                  ],
                },
              },
            ],
          },
        },
      };

      mockClient.query.mockResolvedValue(mockMenus);

      const result = await fetcher.fetchMenus();

      expect(result).toEqual(mockMenus);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('getMenus')
      );
    });
  });
});

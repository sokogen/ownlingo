import { WebhookRegistry } from '../src/webhooks/registry';
import { ShopifyGraphQLClient } from '../src/shopify/client';

// Mock Shopify client
const mockClient = {
  query: jest.fn(),
} as unknown as ShopifyGraphQLClient;

describe('WebhookRegistry', () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry(mockClient);
    jest.clearAllMocks();
  });

  describe('registerWebhooks', () => {
    it('should register multiple webhooks', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptionCreate: {
          userErrors: [],
          webhookSubscription: {
            id: 'gid://shopify/WebhookSubscription/123',
            topic: 'PRODUCTS_UPDATE',
            endpoint: {
              __typename: 'WebhookHttpEndpoint',
              callbackUrl: 'https://example.com/webhooks',
            },
          },
        },
      });

      const result = await registry.registerWebhooks({
        topics: ['PRODUCTS_UPDATE', 'COLLECTIONS_UPDATE'],
        callbackUrl: 'https://example.com/webhooks',
      });

      expect(result).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should handle registration errors', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptionCreate: {
          userErrors: [
            {
              field: 'callbackUrl',
              message: 'Invalid URL',
            },
          ],
          webhookSubscription: null,
        },
      });

      await expect(
        registry.registerWebhooks({
          topics: ['PRODUCTS_UPDATE'],
          callbackUrl: 'invalid-url',
        })
      ).rejects.toThrow('Failed to create webhook subscription');
    });
  });

  describe('listWebhookSubscriptions', () => {
    it('should list all webhook subscriptions', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptions: {
          edges: [
            {
              node: {
                id: 'gid://shopify/WebhookSubscription/123',
                topic: 'PRODUCTS_UPDATE',
                endpoint: {
                  __typename: 'WebhookHttpEndpoint',
                  callbackUrl: 'https://example.com/webhooks',
                },
              },
            },
            {
              node: {
                id: 'gid://shopify/WebhookSubscription/456',
                topic: 'COLLECTIONS_UPDATE',
                endpoint: {
                  __typename: 'WebhookHttpEndpoint',
                  callbackUrl: 'https://example.com/webhooks',
                },
              },
            },
          ],
        },
      });

      const subscriptions = await registry.listWebhookSubscriptions();

      expect(subscriptions).toHaveLength(2);
      expect(subscriptions[0].topic).toBe('PRODUCTS_UPDATE');
      expect(subscriptions[1].topic).toBe('COLLECTIONS_UPDATE');
    });

    it('should handle empty subscription list', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptions: {
          edges: [],
        },
      });

      const subscriptions = await registry.listWebhookSubscriptions();

      expect(subscriptions).toHaveLength(0);
    });
  });

  describe('deleteWebhookSubscription', () => {
    it('should delete a webhook subscription', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptionDelete: {
          userErrors: [],
          deletedWebhookSubscriptionId: 'gid://shopify/WebhookSubscription/123',
        },
      });

      await expect(
        registry.deleteWebhookSubscription('gid://shopify/WebhookSubscription/123')
      ).resolves.not.toThrow();
    });

    it('should handle deletion errors', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptionDelete: {
          userErrors: [
            {
              field: 'id',
              message: 'Subscription not found',
            },
          ],
          deletedWebhookSubscriptionId: null,
        },
      });

      await expect(
        registry.deleteWebhookSubscription('gid://shopify/WebhookSubscription/999')
      ).rejects.toThrow('Failed to delete webhook subscription');
    });
  });

  describe('deleteAllWebhookSubscriptions', () => {
    it('should delete all subscriptions', async () => {
      // Mock list call
      mockClient.query = jest
        .fn()
        .mockResolvedValueOnce({
          webhookSubscriptions: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/WebhookSubscription/123',
                  topic: 'PRODUCTS_UPDATE',
                  endpoint: {
                    __typename: 'WebhookHttpEndpoint',
                    callbackUrl: 'https://example.com/webhooks',
                  },
                },
              },
              {
                node: {
                  id: 'gid://shopify/WebhookSubscription/456',
                  topic: 'COLLECTIONS_UPDATE',
                  endpoint: {
                    __typename: 'WebhookHttpEndpoint',
                    callbackUrl: 'https://example.com/webhooks',
                  },
                },
              },
            ],
          },
        })
        // Mock delete calls
        .mockResolvedValue({
          webhookSubscriptionDelete: {
            userErrors: [],
            deletedWebhookSubscriptionId: 'deleted',
          },
        });

      const count = await registry.deleteAllWebhookSubscriptions();

      expect(count).toBe(2);
      expect(mockClient.query).toHaveBeenCalledTimes(3); // 1 list + 2 deletes
    });
  });

  describe('webhookExists', () => {
    it('should check if webhook exists', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptions: {
          edges: [
            {
              node: {
                id: 'gid://shopify/WebhookSubscription/123',
                topic: 'PRODUCTS_UPDATE',
                endpoint: {
                  __typename: 'WebhookHttpEndpoint',
                  callbackUrl: 'https://example.com/webhooks',
                },
              },
            },
          ],
        },
      });

      const exists = await registry.webhookExists(
        'PRODUCTS_UPDATE',
        'https://example.com/webhooks'
      );

      expect(exists).toBe(true);
    });

    it('should return false if webhook does not exist', async () => {
      mockClient.query = jest.fn().mockResolvedValue({
        webhookSubscriptions: {
          edges: [],
        },
      });

      const exists = await registry.webhookExists(
        'PRODUCTS_UPDATE',
        'https://example.com/webhooks'
      );

      expect(exists).toBe(false);
    });
  });
});

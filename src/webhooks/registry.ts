import { ShopifyGraphQLClient } from '../shopify/client';

export type WebhookTopic =
  | 'PRODUCTS_UPDATE'
  | 'PRODUCTS_DELETE'
  | 'COLLECTIONS_UPDATE'
  | 'COLLECTIONS_DELETE';

export interface WebhookSubscription {
  id: string;
  topic: string;
  endpoint: string;
}

export interface RegisterWebhooksOptions {
  topics: WebhookTopic[];
  callbackUrl: string;
}

/**
 * Manages Shopify webhook subscriptions
 */
export class WebhookRegistry {
  private client: ShopifyGraphQLClient;

  constructor(client: ShopifyGraphQLClient) {
    this.client = client;
  }

  /**
   * Register webhooks for specified topics
   */
  async registerWebhooks(
    options: RegisterWebhooksOptions
  ): Promise<WebhookSubscription[]> {
    const subscriptions: WebhookSubscription[] = [];

    for (const topic of options.topics) {
      const subscription = await this.createWebhookSubscription(
        topic,
        options.callbackUrl
      );
      subscriptions.push(subscription);
    }

    return subscriptions;
  }

  /**
   * Create a webhook subscription for a specific topic
   */
  private async createWebhookSubscription(
    topic: WebhookTopic,
    callbackUrl: string
  ): Promise<WebhookSubscription> {
    const mutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          userErrors {
            field
            message
          }
          webhookSubscription {
            id
            topic
            endpoint {
              __typename
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    `;

    const variables = {
      topic,
      webhookSubscription: {
        callbackUrl,
        format: 'JSON',
      },
    };

    const response = await this.client.query<any>(mutation, variables);

    if (response.webhookSubscriptionCreate.userErrors.length > 0) {
      const errors = response.webhookSubscriptionCreate.userErrors
        .map((e: any) => e.message)
        .join(', ');
      throw new Error(`Failed to create webhook subscription: ${errors}`);
    }

    const subscription = response.webhookSubscriptionCreate.webhookSubscription;
    return {
      id: subscription.id,
      topic: subscription.topic,
      endpoint: subscription.endpoint.callbackUrl,
    };
  }

  /**
   * List all webhook subscriptions
   */
  async listWebhookSubscriptions(): Promise<WebhookSubscription[]> {
    const query = `
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.client.query<any>(query);
    const edges = response.webhookSubscriptions.edges;

    return edges.map((edge: any) => ({
      id: edge.node.id,
      topic: edge.node.topic,
      endpoint: edge.node.endpoint.callbackUrl,
    }));
  }

  /**
   * Delete a webhook subscription
   */
  async deleteWebhookSubscription(subscriptionId: string): Promise<void> {
    const mutation = `
      mutation webhookSubscriptionDelete($id: ID!) {
        webhookSubscriptionDelete(id: $id) {
          userErrors {
            field
            message
          }
          deletedWebhookSubscriptionId
        }
      }
    `;

    const variables = { id: subscriptionId };
    const response = await this.client.query<any>(mutation, variables);

    if (response.webhookSubscriptionDelete.userErrors.length > 0) {
      const errors = response.webhookSubscriptionDelete.userErrors
        .map((e: any) => e.message)
        .join(', ');
      throw new Error(`Failed to delete webhook subscription: ${errors}`);
    }
  }

  /**
   * Delete all webhook subscriptions
   */
  async deleteAllWebhookSubscriptions(): Promise<number> {
    const subscriptions = await this.listWebhookSubscriptions();

    for (const subscription of subscriptions) {
      await this.deleteWebhookSubscription(subscription.id);
    }

    return subscriptions.length;
  }

  /**
   * Check if webhook already exists for a topic and URL
   */
  async webhookExists(topic: WebhookTopic, callbackUrl: string): Promise<boolean> {
    const subscriptions = await this.listWebhookSubscriptions();
    return subscriptions.some(
      (sub) => sub.topic === topic && sub.endpoint === callbackUrl
    );
  }
}

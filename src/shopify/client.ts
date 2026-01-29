import { shopifyApi, Session } from '@shopify/shopify-api';

export interface ShopifyConfig {
  shop: string; // e.g. "mystore.myshopify.com"
  accessToken: string;
  apiVersion?: string;
}

export class ShopifyGraphQLClient {
  private config: ShopifyConfig;
  private shopify: ReturnType<typeof shopifyApi>;
  private session: Session;

  constructor(config: ShopifyConfig) {
    this.config = config;

    // Initialize Shopify API
    this.shopify = shopifyApi({
      apiKey: 'dummy-key', // Not needed for private apps with access token
      apiSecretKey: 'dummy-secret',
      scopes: [],
      hostName: this.config.shop.replace(/^https?:\/\//, ''),
      apiVersion: (config.apiVersion || '2024-01') as any,
      isEmbeddedApp: false,
    });

    // Create session for API calls
    this.session = new Session({
      id: `${this.config.shop}-session`,
      shop: this.config.shop,
      state: 'active',
      isOnline: false,
      accessToken: this.config.accessToken,
    });
  }

  async query<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    const client = new this.shopify.clients.Graphql({
      session: this.session,
    });

    try {
      const response = await client.request(query, { variables });
      return response.data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Shopify GraphQL error: ${error.message}`);
      }
      throw error;
    }
  }

  getShop(): string {
    return this.config.shop;
  }
}

import { GraphQLClient } from 'graphql-request';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}

export class ShopifyGraphQLClient {
  private client: GraphQLClient;
  private config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '2024-01',
    };

    const endpoint = `https://${this.config.shopDomain}/admin/api/${this.config.apiVersion}/graphql.json`;

    this.client = new GraphQLClient(endpoint, {
      headers: {
        'X-Shopify-Access-Token': this.config.accessToken,
        'Content-Type': 'application/json',
      },
    });
  }

  async query<T = any>(query: string, variables?: any): Promise<T> {
    try {
      const response = await this.client.request<T>(query, variables);
      return response;
    } catch (error: any) {
      throw new Error(`Shopify GraphQL query failed: ${error.message}`);
    }
  }

  async mutate<T = any>(mutation: string, variables?: any): Promise<T> {
    try {
      const response = await this.client.request<T>(mutation, variables);
      return response;
    } catch (error: any) {
      throw new Error(`Shopify GraphQL mutation failed: ${error.message}`);
    }
  }
}

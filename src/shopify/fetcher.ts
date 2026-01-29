import { ShopifyGraphQLClient } from './client';
import {
  TRANSLATABLE_RESOURCES_QUERY,
  PRODUCT_DETAILS_QUERY,
  COLLECTION_DETAILS_QUERY,
  PAGE_DETAILS_QUERY,
  ARTICLE_DETAILS_QUERY,
  MENUS_QUERY,
} from './queries';

export type ResourceType =
  | 'PRODUCT'
  | 'COLLECTION'
  | 'PAGE'
  | 'ARTICLE'
  | 'MENU';

export interface TranslatableContent {
  key: string;
  value: string;
  digest: string;
  locale: string;
}

export interface TranslatableResource {
  resourceId: string;
  resourceType: ResourceType;
  translatableContent: TranslatableContent[];
}

export interface FetchOptions {
  resourceTypes?: ResourceType[];
  pageSize?: number;
  maxPages?: number;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface TranslatableResourcesResponse {
  translatableResources: {
    edges: Array<{
      node: {
        resourceId: string;
        translatableContent: TranslatableContent[];
      };
      cursor: string;
    }>;
    pageInfo: PageInfo;
  };
}

export class ShopifyContentFetcher {
  private client: ShopifyGraphQLClient;
  private readonly DEFAULT_PAGE_SIZE = 50;
  private readonly MAX_PAGES = 100; // Safety limit

  constructor(client: ShopifyGraphQLClient) {
    this.client = client;
  }

  /**
   * Fetch all translatable resources for specified resource types
   */
  async fetchAllTranslatableResources(
    options: FetchOptions = {}
  ): Promise<TranslatableResource[]> {
    const {
      resourceTypes = ['PRODUCT', 'COLLECTION', 'PAGE', 'ARTICLE'],
      pageSize = this.DEFAULT_PAGE_SIZE,
      maxPages = this.MAX_PAGES,
    } = options;

    const allResources: TranslatableResource[] = [];

    for (const resourceType of resourceTypes) {
      const resources = await this.fetchTranslatableResourcesByType(
        resourceType,
        pageSize,
        maxPages
      );
      allResources.push(...resources);
    }

    return allResources;
  }

  /**
   * Fetch translatable resources for a specific type with pagination
   */
  async fetchTranslatableResourcesByType(
    resourceType: ResourceType,
    pageSize: number = this.DEFAULT_PAGE_SIZE,
    maxPages: number = this.MAX_PAGES
  ): Promise<TranslatableResource[]> {
    const resources: TranslatableResource[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    while (hasNextPage && pageCount < maxPages) {
      const response = await this.client.query<TranslatableResourcesResponse>(
        TRANSLATABLE_RESOURCES_QUERY,
        {
          resourceType,
          first: pageSize,
          after: cursor,
        }
      );

      const edges = response.translatableResources.edges;
      const pageInfo = response.translatableResources.pageInfo;

      // Add resources from this page
      for (const edge of edges) {
        resources.push({
          resourceId: edge.node.resourceId,
          resourceType,
          translatableContent: edge.node.translatableContent,
        });
      }

      // Update pagination state
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
      pageCount++;
    }

    return resources;
  }

  /**
   * Fetch detailed product information
   */
  async fetchProductDetails(productId: string): Promise<any> {
    return this.client.query(PRODUCT_DETAILS_QUERY, { id: productId });
  }

  /**
   * Fetch detailed collection information
   */
  async fetchCollectionDetails(collectionId: string): Promise<any> {
    return this.client.query(COLLECTION_DETAILS_QUERY, { id: collectionId });
  }

  /**
   * Fetch detailed page information
   */
  async fetchPageDetails(pageId: string): Promise<any> {
    return this.client.query(PAGE_DETAILS_QUERY, { id: pageId });
  }

  /**
   * Fetch detailed article information
   */
  async fetchArticleDetails(articleId: string): Promise<any> {
    return this.client.query(ARTICLE_DETAILS_QUERY, { id: articleId });
  }

  /**
   * Fetch navigation menus
   */
  async fetchMenus(): Promise<any> {
    return this.client.query(MENUS_QUERY);
  }
}

import { PrismaClient } from '@prisma/client';
import { ShopifyContentFetcher, ResourceType } from '../shopify/fetcher';
import { ContentHashRepository } from '../db/content-hash';
import { SyncStatusRepository } from '../db/sync-status';

export type WebhookTopic =
  | 'products/update'
  | 'products/delete'
  | 'collections/update'
  | 'collections/delete';

export interface WebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  [key: string]: any;
}

export interface WebhookProcessResult {
  success: boolean;
  resourceId: string;
  resourceType: ResourceType;
  hasChanged: boolean;
  affectedTranslations?: number;
  error?: string;
}

export interface WebhookHandlerOptions {
  autoTriggerTranslation?: boolean;
  shopId: string;
}

/**
 * Handles Shopify webhooks for content change detection
 */
export class WebhookHandler {
  private prisma: PrismaClient;
  private contentRepo: ContentHashRepository;
  private syncRepo: SyncStatusRepository;
  private fetcher: ShopifyContentFetcher;
  private options: WebhookHandlerOptions;

  constructor(
    prisma: PrismaClient,
    fetcher: ShopifyContentFetcher,
    options: WebhookHandlerOptions
  ) {
    this.prisma = prisma;
    this.fetcher = fetcher;
    this.options = options;
    this.contentRepo = new ContentHashRepository(prisma);
    this.syncRepo = new SyncStatusRepository(prisma);
  }

  /**
   * Process a webhook from Shopify
   */
  async handleWebhook(
    topic: WebhookTopic,
    payload: WebhookPayload
  ): Promise<WebhookProcessResult> {
    try {
      // Parse webhook topic to determine resource type
      const resourceType = this.getResourceTypeFromTopic(topic);
      const resourceId = payload.admin_graphql_api_id;

      // Handle delete webhooks
      if (topic.endsWith('/delete')) {
        return this.handleDelete(resourceType, resourceId);
      }

      // Fetch updated content from Shopify
      const resource = await this.fetchResource(resourceType, resourceId);

      // Update content hashes and detect changes
      const changes = await this.updateContentHashes(
        resourceType,
        resourceId,
        resource
      );

      // Find affected translations if content changed
      let affectedTranslations = 0;
      if (changes.hasChanged) {
        affectedTranslations = await this.handleContentChange(
          changes.contentHashIds
        );
      }

      return {
        success: true,
        resourceId,
        resourceType,
        hasChanged: changes.hasChanged,
        affectedTranslations,
      };
    } catch (error) {
      return {
        success: false,
        resourceId: payload.admin_graphql_api_id,
        resourceType: this.getResourceTypeFromTopic(topic),
        hasChanged: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get resource type from webhook topic
   */
  private getResourceTypeFromTopic(topic: WebhookTopic): ResourceType {
    if (topic.startsWith('products/')) return 'PRODUCT';
    if (topic.startsWith('collections/')) return 'COLLECTION';
    throw new Error(`Unsupported webhook topic: ${topic}`);
  }

  /**
   * Fetch resource from Shopify based on type
   */
  private async fetchResource(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<any> {
    switch (resourceType) {
      case 'PRODUCT':
        return this.fetcher.fetchProductDetails(resourceId);
      case 'COLLECTION':
        return this.fetcher.fetchCollectionDetails(resourceId);
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  /**
   * Update content hashes for a resource
   */
  private async updateContentHashes(
    resourceType: ResourceType,
    resourceId: string,
    resource: any
  ): Promise<{ hasChanged: boolean; contentHashIds: string[] }> {
    const contentHashIds: string[] = [];
    let hasChanged = false;

    // Extract translatable fields based on resource type
    const fields = this.getTranslatableFields(resourceType, resource);

    for (const [fieldName, content] of Object.entries(fields)) {
      if (typeof content === 'string' && content.trim()) {
        const result = await this.contentRepo.upsertContentHash(
          this.options.shopId,
          resourceType.toLowerCase(),
          resourceId,
          fieldName,
          content
        );

        contentHashIds.push(result.id);
        if (result.hasChanged) {
          hasChanged = true;
        }
      }
    }

    return { hasChanged, contentHashIds };
  }

  /**
   * Extract translatable fields from resource
   */
  private getTranslatableFields(
    resourceType: ResourceType,
    resource: any
  ): Record<string, string> {
    switch (resourceType) {
      case 'PRODUCT': {
        const product = resource.product;
        return {
          title: product?.title || '',
          description: product?.descriptionHtml || product?.description || '',
          ...(product?.seo && {
            seoTitle: product.seo.title || '',
            seoDescription: product.seo.description || '',
          }),
        };
      }
      case 'COLLECTION': {
        const collection = resource.collection;
        return {
          title: collection?.title || '',
          description:
            collection?.descriptionHtml || collection?.description || '',
          ...(collection?.seo && {
            seoTitle: collection.seo.title || '',
            seoDescription: collection.seo.description || '',
          }),
        };
      }
      default:
        return {};
    }
  }

  /**
   * Handle content change - find affected translations
   */
  private async handleContentChange(
    contentHashIds: string[]
  ): Promise<number> {
    // Find all completed translations for these content hashes
    const translations = await this.prisma.translation.findMany({
      where: {
        contentHashId: { in: contentHashIds },
        status: 'COMPLETED',
      },
    });

    // If auto-trigger is enabled, queue translation jobs
    if (this.options.autoTriggerTranslation && translations.length > 0) {
      await this.queueTranslations(translations);
    }

    return translations.length;
  }

  /**
   * Queue translations for outdated content
   */
  private async queueTranslations(translations: any[]): Promise<void> {
    // Update translation status to PENDING
    const translationIds = translations.map((t) => t.id);
    await this.prisma.translation.updateMany({
      where: { id: { in: translationIds } },
      data: {
        status: 'PENDING',
        updatedAt: new Date(),
      },
    });

    // TODO: Integrate with actual translation job queue
    // For now, just mark as pending
    console.log(
      `Queued ${translations.length} translations for processing`
    );
  }

  /**
   * Handle resource deletion
   */
  private async handleDelete(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<WebhookProcessResult> {
    // Delete content hashes for this resource
    await this.prisma.contentHash.deleteMany({
      where: {
        shopId: this.options.shopId,
        resourceType: resourceType.toLowerCase(),
        resourceId,
      },
    });

    return {
      success: true,
      resourceId,
      resourceType,
      hasChanged: false,
    };
  }
}

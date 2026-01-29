// Main exports for Ownlingo Shopify Content Translation System

export { ShopifyGraphQLClient, ShopifyConfig } from './shopify/client';
export {
  ShopifyContentFetcher,
  ResourceType,
  TranslatableContent,
  TranslatableResource,
  FetchOptions,
  PageInfo,
} from './shopify/fetcher';
export { ContentHashRepository } from './db/content-hash';
export {
  SyncStatusService,
  SyncStatus,
  ContentSyncStatus,
  SyncStatusAggregation,
  SyncStatusByType,
} from './sync/status';

// Re-export Prisma client for convenience
export { PrismaClient } from '@prisma/client';

# Content Hash System

The Content Hash System provides change detection and sync status tracking for translatable content in Ownlingo.

## Features

- **Change Detection**: Automatically detects when source content changes using SHA-256 hashing
- **Sync Status Tracking**: Track translation status per resource per locale
- **Efficient Queries**: Find untranslated or outdated content quickly
- **Dashboard Aggregations**: Get translation progress metrics for dashboards

## Sync Status Types

The system tracks four sync statuses for each content item + locale combination:

- `synced`: Translation exists, is completed, and source hash matches current content hash
- `outdated`: Translation exists but source content has changed (hashes don't match)
- `pending`: No translation exists for this locale
- `error`: Translation attempt failed

## Usage

### Basic Setup

```typescript
import { PrismaClient } from '@prisma/client';
import { SyncStatusService, ContentHashRepository } from 'ownlingo';

const prisma = new PrismaClient();
const syncService = new SyncStatusService(prisma);
const contentHashRepo = new ContentHashRepository(prisma);
```

### Getting Sync Status

```typescript
// Get sync status for all content in a shop for French locale
const statuses = await syncService.getShopSyncStatus('shop-id', 'fr');

console.log(statuses);
// [
//   {
//     contentHashId: 'hash-1',
//     resourceType: 'product',
//     resourceId: 'gid://shopify/Product/123',
//     fieldName: 'title',
//     locale: 'fr',
//     syncStatus: 'synced',
//     translationId: 'trans-1',
//     translationStatus: 'COMPLETED'
//   },
//   {
//     contentHashId: 'hash-2',
//     resourceType: 'product',
//     resourceId: 'gid://shopify/Product/124',
//     fieldName: 'description',
//     locale: 'fr',
//     syncStatus: 'outdated',
//     translationId: 'trans-2',
//     translationStatus: 'COMPLETED'
//   },
//   {
//     contentHashId: 'hash-3',
//     resourceType: 'collection',
//     resourceId: 'gid://shopify/Collection/1',
//     fieldName: 'title',
//     locale: 'fr',
//     syncStatus: 'pending'
//   }
// ]
```

### Finding Untranslated Content

```typescript
// Find all content that needs translation
const untranslated = await syncService.findUntranslated('shop-id', 'fr');

// Find all outdated content that needs retranslation
const outdated = await syncService.findOutdated('shop-id', 'fr');

// Find only products that need translation
const untranslatedProducts = await syncService.findUntranslated(
  'shop-id',
  'fr',
  'product'
);
```

### Getting Aggregations for Dashboards

```typescript
// Get overall aggregation
const agg = await syncService.getAggregation('shop-id', 'fr');
console.log(agg);
// {
//   synced: 150,
//   outdated: 20,
//   pending: 30,
//   error: 5,
//   total: 205
// }

// Get aggregation by resource type
const byType = await syncService.getAggregationByType('shop-id', 'fr');
console.log(byType);
// [
//   {
//     resourceType: 'product',
//     aggregation: {
//       synced: 100,
//       outdated: 10,
//       pending: 20,
//       error: 3,
//       total: 133
//     }
//   },
//   {
//     resourceType: 'collection',
//     aggregation: {
//       synced: 50,
//       outdated: 10,
//       pending: 10,
//       error: 2,
//       total: 72
//     }
//   }
// ]

// Get progress percentage
const progress = await syncService.getProgress('shop-id', 'fr');
console.log(`Translation progress: ${progress}%`); // Translation progress: 73%
```

## How Content Changes Are Detected

### 1. Content Fetching and Hashing

When content is fetched from Shopify:

```typescript
import { ShopifyContentFetcher, ContentHashRepository } from 'ownlingo';

const fetcher = new ShopifyContentFetcher(client);
const contentHashRepo = new ContentHashRepository(prisma);

// Fetch translatable resources
const resources = await fetcher.fetchAllTranslatableResources();

// Store and detect changes
const result = await contentHashRepo.storeTranslatableResources('shop-id', resources);

console.log(result);
// {
//   totalProcessed: 100,
//   newContent: 10,      // New content items
//   changedContent: 5,   // Content that changed
//   unchangedContent: 85 // Content that stayed the same
// }
```

### 2. Creating Translations with Source Hash

When creating a translation, store the source hash:

```typescript
// Get current content hash
const contentHash = await prisma.contentHash.findUnique({
  where: {
    shopId_resourceType_resourceId_fieldName: {
      shopId: 'shop-id',
      resourceType: 'product',
      resourceId: 'gid://shopify/Product/123',
      fieldName: 'title',
    },
  },
});

// Create translation with source hash
await prisma.translation.create({
  data: {
    shopId: 'shop-id',
    languageId: 'lang-fr',
    contentHashId: contentHash.id,
    sourceContentHash: contentHash.hash, // ← Store current hash
    translatedText: 'Produit Test',
    status: 'COMPLETED',
  },
});
```

### 3. Detecting Outdated Translations

When content is refetched and its hash changes:

```typescript
// After refetching content, the ContentHash.hash is updated
// The SyncStatusService compares Translation.sourceContentHash with ContentHash.hash
const statuses = await syncService.getShopSyncStatus('shop-id', 'fr');

// Translations with sourceContentHash !== ContentHash.hash are marked as 'outdated'
const needsRetranslation = statuses.filter((s) => s.syncStatus === 'outdated');
```

## Database Schema

The system uses the following Prisma models:

### ContentHash

```prisma
model ContentHash {
  id           String   @id @default(cuid())
  shopId       String
  resourceType String   // e.g. "product", "collection"
  resourceId   String   // Shopify resource ID
  fieldName    String   // e.g. "title", "description"
  hash         String   // SHA-256 hash of content
  content      String   // Original content text
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  shop         Shop          @relation(...)
  translations Translation[]

  @@unique([shopId, resourceType, resourceId, fieldName])
  @@index([shopId, resourceType])
  @@index([hash])
}
```

### Translation

```prisma
model Translation {
  id                String            @id @default(cuid())
  shopId            String
  languageId        String
  contentHashId     String
  sourceContentHash String            // Hash at translation time
  translatedText    String
  status            TranslationStatus @default(PENDING)
  // ... other fields

  shop        Shop        @relation(...)
  language    Language    @relation(...)
  contentHash ContentHash @relation(...)

  @@unique([contentHashId, languageId])
  @@index([shopId, status])
}
```

## Performance Considerations

### Efficient Queries

The system uses database indexes for efficient queries:

- `contentHashId + languageId` unique index on Translation table
- `shopId + resourceType` index on ContentHash table
- `shopId + status` index on Translation table

### Pagination for Large Shops

For shops with many content items, use pagination or filtering by resource type:

```typescript
// Process by resource type
const productStatuses = await syncService.getShopSyncStatus('shop-id', 'fr', 'product');
const collectionStatuses = await syncService.getShopSyncStatus('shop-id', 'fr', 'collection');
```

## Best Practices

1. **Always store source hash**: When creating translations, always store `sourceContentHash` from the current ContentHash
2. **Batch operations**: Use transactions for batch translation updates
3. **Filter by resource type**: When working with large shops, filter by resource type to reduce query load
4. **Monitor outdated content**: Set up alerts when outdated content count exceeds threshold
5. **Retry failed translations**: Use the 'error' status to identify and retry failed translations

## Example: Full Translation Workflow

```typescript
import { PrismaClient } from '@prisma/client';
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
  SyncStatusService,
} from 'ownlingo';

const prisma = new PrismaClient();

// 1. Fetch content from Shopify
const client = new ShopifyGraphQLClient({
  shop: 'mystore.myshopify.com',
  accessToken: 'token',
});

const fetcher = new ShopifyContentFetcher(client);
const resources = await fetcher.fetchAllTranslatableResources();

// 2. Store and detect changes
const contentHashRepo = new ContentHashRepository(prisma);
const result = await contentHashRepo.storeTranslatableResources('shop-id', resources);

console.log(`New: ${result.newContent}, Changed: ${result.changedContent}`);

// 3. Find what needs translation
const syncService = new SyncStatusService(prisma);
const pending = await syncService.findUntranslated('shop-id', 'fr');
const outdated = await syncService.findOutdated('shop-id', 'fr');

console.log(`Need translation: ${pending.length}`);
console.log(`Need retranslation: ${outdated.length}`);

// 4. Get dashboard metrics
const progress = await syncService.getProgress('shop-id', 'fr');
const byType = await syncService.getAggregationByType('shop-id', 'fr');

console.log(`Progress: ${progress}%`);
console.log('By type:', byType);
```

## Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- Sync status computation (pending, synced, outdated, error)
- Finding untranslated and outdated content
- Aggregations and progress calculations
- Resource type filtering

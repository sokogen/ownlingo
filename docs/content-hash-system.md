# Content Hash System

The Content Hash System provides robust change detection and synchronization tracking for translatable content in Ownlingo. It ensures translations stay up-to-date with source content changes and provides powerful querying capabilities for managing translation workflows.

## Overview

The system uses **SHA-256 hashing** to detect content changes and tracks the synchronization status of translations relative to their source content. This enables:

- **Automatic change detection**: Know when Shopify content has changed
- **Sync status tracking**: Track whether translations are synced, outdated, pending, or in error
- **Efficient queries**: Find untranslated or outdated content quickly
- **Dashboard metrics**: Get aggregated statistics for monitoring translation progress

## Architecture

The system consists of two main repositories:

### 1. ContentHashRepository

Handles content hashing and change detection:

```typescript
import { PrismaClient } from '@prisma/client';
import { ContentHashRepository } from './db/content-hash';

const prisma = new PrismaClient();
const contentRepo = new ContentHashRepository(prisma);
```

**Key Methods:**

- `upsertContentHash(shopId, resourceType, resourceId, fieldName, content)` - Store/update content hash
- `storeTranslatableResources(shopId, resources)` - Batch process Shopify resources
- `getContentHashesByShop(shopId, resourceType?)` - Retrieve content hashes
- `hasContentChanged(shopId, resourceType, resourceId, fieldName, newContent)` - Check for changes

### 2. SyncStatusRepository

Tracks translation synchronization status:

```typescript
import { SyncStatusRepository } from './db/sync-status';

const syncRepo = new SyncStatusRepository(prisma);
```

**Key Methods:**

- `getOutdatedTranslations(shopId, locale?, resourceType?)` - Find outdated translations
- `getUntranslatedContent(shopId, targetLocales, resourceType?)` - Find missing translations
- `getAllSyncStatuses(shopId, locale?, resourceType?)` - Get all translation sync statuses
- `getSyncAggregation(shopId, locale?, resourceType?)` - Get aggregated statistics
- `getSyncAggregationByLocale(shopId, resourceType?)` - Stats grouped by locale
- `getSyncAggregationByResourceType(shopId, locale?)` - Stats grouped by resource type

## Sync Status Types

The system defines four sync statuses:

| Status | Description |
|--------|-------------|
| `synced` | Translation is up-to-date with current content |
| `outdated` | Content was updated after translation was completed |
| `pending` | Translation is in progress or queued |
| `error` | Translation failed or encountered an error |

**Status Determination Logic:**

```typescript
if (translation.status === 'FAILED' || translation.errorMessage) {
  return 'error';
} else if (translation.status === 'PENDING' || translation.status === 'IN_PROGRESS') {
  return 'pending';
} else if (contentHash.updatedAt > translation.updatedAt) {
  return 'outdated';
} else if (translation.status === 'COMPLETED') {
  return 'synced';
}
```

## Usage Examples

### Detecting Content Changes

```typescript
// Fetch content from Shopify
const fetcher = new ShopifyContentFetcher(shopifyClient);
const products = await fetcher.fetchTranslatableResourcesByType('PRODUCT');

// Store content and detect changes
const stats = await contentRepo.storeTranslatableResources(shopId, products);

console.log(`New content: ${stats.newContent}`);
console.log(`Changed content: ${stats.changedContent}`);
console.log(`Unchanged content: ${stats.unchangedContent}`);
```

### Finding Outdated Translations

```typescript
// Find all outdated French translations
const outdated = await syncRepo.getOutdatedTranslations(shopId, 'fr');

for (const item of outdated) {
  console.log(`${item.resourceType}:${item.resourceId}.${item.fieldName}`);
  console.log(`  Content updated: ${item.contentUpdatedAt}`);
  console.log(`  Translation updated: ${item.translationUpdatedAt}`);
}

// Find outdated translations for specific resource type
const outdatedProducts = await syncRepo.getOutdatedTranslations(
  shopId,
  'fr',
  'product'
);
```

### Finding Untranslated Content

```typescript
// Find content missing French or Spanish translations
const untranslated = await syncRepo.getUntranslatedContent(
  shopId,
  ['fr', 'es']
);

for (const item of untranslated) {
  console.log(`${item.resourceType}:${item.resourceId}.${item.fieldName}`);
  console.log(`  Missing locales: ${item.missingLocales.join(', ')}`);
  console.log(`  Content: ${item.content.substring(0, 50)}...`);
}

// Find untranslated products only
const untranslatedProducts = await syncRepo.getUntranslatedContent(
  shopId,
  ['fr', 'es'],
  'product'
);
```

### Getting Sync Statistics

```typescript
// Overall statistics
const stats = await syncRepo.getSyncAggregation(shopId);
console.log(`Total: ${stats.total}`);
console.log(`Synced: ${stats.synced} (${(stats.synced / stats.total * 100).toFixed(1)}%)`);
console.log(`Outdated: ${stats.outdated}`);
console.log(`Pending: ${stats.pending}`);
console.log(`Error: ${stats.error}`);

// Statistics by locale
const byLocale = await syncRepo.getSyncAggregationByLocale(shopId);
for (const [locale, agg] of byLocale) {
  console.log(`${locale}: ${agg.synced}/${agg.total} synced`);
}

// Statistics by resource type
const byType = await syncRepo.getSyncAggregationByResourceType(shopId);
for (const [type, agg] of byType) {
  console.log(`${type}: ${agg.synced}/${agg.total} synced`);
}
```

### Checking All Sync Statuses

```typescript
// Get all translation sync statuses
const statuses = await syncRepo.getAllSyncStatuses(shopId);

// Filter by status
const needsRetranslation = statuses.filter(s => s.syncStatus === 'outdated');
const inProgress = statuses.filter(s => s.syncStatus === 'pending');
const errors = statuses.filter(s => s.syncStatus === 'error');

// Get statuses for specific locale and resource type
const frenchProducts = await syncRepo.getAllSyncStatuses(
  shopId,
  'fr',
  'product'
);
```

## Database Schema

### ContentHash Table

```sql
CREATE TABLE content_hashes (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,  -- 'product', 'collection', 'page', etc.
  resource_id TEXT NOT NULL,     -- Shopify GID
  field_name TEXT NOT NULL,      -- 'title', 'description', etc.
  hash TEXT NOT NULL,            -- SHA-256 hash
  content TEXT NOT NULL,         -- Original content
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,

  UNIQUE(shop_id, resource_type, resource_id, field_name),
  INDEX(shop_id, resource_type),
  INDEX(hash)
);
```

**Key Points:**

- Composite unique constraint ensures one hash per field per resource
- `updatedAt` tracks when content last changed
- Index on `hash` enables duplicate detection
- Index on `[shop_id, resource_type]` optimizes type-filtered queries

### Translation Table (Relevant Fields)

```sql
CREATE TABLE translations (
  id TEXT PRIMARY KEY,
  content_hash_id TEXT NOT NULL,
  language_id TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW'),
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,

  UNIQUE(content_hash_id, language_id),
  FOREIGN KEY(content_hash_id) REFERENCES content_hashes(id)
);
```

**Sync Status Determination:**

The sync status is computed by comparing timestamps:
- `contentHash.updatedAt > translation.updatedAt` → **outdated**
- `translation.status === 'COMPLETED'` and timestamps match → **synced**
- `translation.status === 'PENDING' | 'IN_PROGRESS'` → **pending**
- `translation.status === 'FAILED'` or has error → **error**

## Performance Considerations

### Efficient Querying

1. **Use filters when possible**
   ```typescript
   // Good - filtered query
   const outdated = await syncRepo.getOutdatedTranslations(shopId, 'fr', 'product');

   // Less efficient - fetch all then filter in code
   const all = await syncRepo.getOutdatedTranslations(shopId);
   const filtered = all.filter(t => t.locale === 'fr' && t.resourceType === 'product');
   ```

2. **Leverage indexes**
   - Queries filter by `shopId` (indexed)
   - Resource type queries use `[shopId, resourceType]` index
   - Hash lookups use `hash` index

3. **Batch operations**
   ```typescript
   // Good - batch process
   const stats = await contentRepo.storeTranslatableResources(shopId, allResources);

   // Bad - individual upserts
   for (const resource of allResources) {
     await contentRepo.upsertContentHash(...);
   }
   ```

### Scalability

For large shops with thousands of products:

1. **Paginate results**
   ```typescript
   // Implement pagination in your application layer
   const PAGE_SIZE = 100;
   let offset = 0;

   while (true) {
     const batch = await getOutdatedTranslations(shopId, locale, resourceType)
       .slice(offset, offset + PAGE_SIZE);
     if (batch.length === 0) break;

     // Process batch
     await processBatch(batch);
     offset += PAGE_SIZE;
   }
   ```

2. **Use background jobs for aggregations**
   - Cache aggregation results
   - Refresh periodically (e.g., every 15 minutes)
   - Use job queue for async updates

3. **Consider materialized views**
   - For very large datasets, consider PostgreSQL materialized views
   - Pre-compute expensive aggregations

## Integration Patterns

### Workflow: Content Sync + Translation

```typescript
async function syncAndTranslate(shopId: string, targetLocales: string[]) {
  // 1. Fetch latest content from Shopify
  const fetcher = new ShopifyContentFetcher(shopifyClient);
  const resources = await fetcher.fetchAllTranslatableResources();

  // 2. Detect changes
  const stats = await contentRepo.storeTranslatableResources(shopId, resources);
  console.log(`Detected ${stats.changedContent} content changes`);

  // 3. Find what needs translation
  const untranslated = await syncRepo.getUntranslatedContent(shopId, targetLocales);
  const outdated = await syncRepo.getOutdatedTranslations(shopId);

  // 4. Queue translation jobs
  const toTranslate = [...untranslated, ...outdated];
  for (const item of toTranslate) {
    await queueTranslationJob(item);
  }

  // 5. Return summary
  return {
    contentChanges: stats.changedContent,
    translationsNeeded: toTranslate.length,
  };
}
```

### Webhook Integration

```typescript
// When Shopify webhook indicates content update
async function handleContentUpdate(webhookPayload: any) {
  const { resourceType, resourceId } = parseWebhook(webhookPayload);

  // Fetch updated content
  const fetcher = new ShopifyContentFetcher(shopifyClient);
  const resource = await fetcher.fetchResourceDetails(resourceType, resourceId);

  // Update content hash
  const result = await contentRepo.upsertContentHash(
    shopId,
    resourceType,
    resourceId,
    'title',
    resource.title
  );

  if (result.hasChanged) {
    // Find affected translations
    const translations = await prisma.translation.findMany({
      where: { contentHashId: result.id, status: 'COMPLETED' }
    });

    // Queue retranslation jobs
    for (const translation of translations) {
      await queueRetranslationJob(translation.id);
    }
  }
}
```

### Dashboard Queries

```typescript
async function getDashboardData(shopId: string) {
  // Overall progress
  const overall = await syncRepo.getSyncAggregation(shopId);

  // Progress by locale
  const byLocale = await syncRepo.getSyncAggregationByLocale(shopId);

  // Progress by resource type
  const byType = await syncRepo.getSyncAggregationByResourceType(shopId);

  // Recent changes
  const recentChanges = await prisma.contentHash.findMany({
    where: { shopId },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  return {
    overall,
    byLocale: Object.fromEntries(byLocale),
    byType: Object.fromEntries(byType),
    recentChanges,
  };
}
```

## Testing

Run the test suite:

```bash
npm test tests/sync-status.test.ts
```

Run with coverage:

```bash
npm test -- --coverage tests/sync-status.test.ts
```

See the [test file](../tests/sync-status.test.ts) for comprehensive examples of each feature.

## See Also

- [Shopify Content Fetcher](./shopify-content-fetcher.md) - Fetching translatable content
- [Database Schema](../prisma/schema.prisma) - Complete schema reference
- [Example Usage](../examples/content-hash-system.ts) - Complete working example

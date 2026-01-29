# Ownlingo

Shopify content translation system with AI-powered translations.

## Features

### ✅ Shopify Content Fetcher (ol-003)

Fetch translatable content from Shopify via GraphQL API:
- Products (title, description, metafields)
- Collections (title, description)
- Pages (title, body)
- Blog posts (title, content)
- Navigation menus
- Theme content (if accessible)

Includes pagination handling and content change detection using SHA-256 hashing.

See [docs/shopify-content-fetcher.md](docs/shopify-content-fetcher.md) for detailed documentation.

### ✅ Content Hash System (ol-004)

Change detection and sync status tracking for translatable content:
- **Automatic change detection** using SHA-256 hashing
- **Sync status tracking** per resource per locale (`synced`, `outdated`, `pending`, `error`)
- **Efficient queries** to find untranslated or outdated content
- **Dashboard metrics** with aggregations by status and resource type

See [docs/content-hash-system.md](docs/content-hash-system.md) for detailed documentation.

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Run tests
npm test
```

## Project Structure

```
src/
├── shopify/
│   ├── client.ts          # Shopify GraphQL client
│   ├── fetcher.ts         # Content fetcher with pagination
│   └── queries.ts         # GraphQL queries
├── db/
│   └── content-hash.ts    # Content hash repository
├── sync/
│   └── status.ts          # Sync status tracking service
└── index.ts               # Main exports

tests/
├── shopify-fetcher.test.ts
├── content-hash.test.ts
└── sync-status.test.ts

examples/
├── fetch-content.ts       # Shopify content fetching example
└── sync-status-example.ts # Sync status tracking example

docs/
├── shopify-content-fetcher.md
└── content-hash-system.md
```

## Environment Variables

```bash
SHOPIFY_SHOP="your-store.myshopify.com"
SHOPIFY_ACCESS_TOKEN="your-admin-api-access-token"
DATABASE_URL="postgresql://user:password@localhost:5432/ownlingo"
```

## Usage Example

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
  shop: 'your-store.myshopify.com',
  accessToken: 'your-access-token',
});

const fetcher = new ShopifyContentFetcher(client);
const resources = await fetcher.fetchAllTranslatableResources({
  resourceTypes: ['PRODUCT', 'COLLECTION'],
  pageSize: 50,
});

// 2. Store content and detect changes
const contentHashRepo = new ContentHashRepository(prisma);
const result = await contentHashRepo.storeTranslatableResources('shop-id', resources);

console.log(`New: ${result.newContent}, Changed: ${result.changedContent}`);

// 3. Track sync status and find work
const syncService = new SyncStatusService(prisma);

// Find untranslated content
const untranslated = await syncService.findUntranslated('shop-id', 'fr');
console.log(`Need translation: ${untranslated.length} items`);

// Find outdated content (needs retranslation)
const outdated = await syncService.findOutdated('shop-id', 'fr');
console.log(`Need retranslation: ${outdated.length} items`);

// Get dashboard metrics
const progress = await syncService.getProgress('shop-id', 'fr');
console.log(`Progress: ${progress}%`);

const byType = await syncService.getAggregationByType('shop-id', 'fr');
console.log('By type:', byType);
```

## Roadmap

- [x] ol-001: Database Schema
- [x] ol-003: Shopify Content Fetcher
- [x] ol-004: Content Hash System
- [ ] ol-005: Translation Job Runner
- [ ] ol-006: Shopify Translation Push
- [ ] ol-007: AI Provider Integration
- [ ] ol-008: Dashboard UI

## License

ISC

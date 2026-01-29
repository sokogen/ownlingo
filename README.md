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

Robust change detection and synchronization tracking:
- SHA-256 content hashing for change detection
- Sync status tracking per resource per locale (`synced`, `outdated`, `pending`, `error`)
- Efficient queries to find untranslated/outdated content
- Dashboard-friendly aggregations by locale and resource type
- Automatic detection of content changes after Shopify updates

See [docs/content-hash-system.md](docs/content-hash-system.md) for detailed documentation.

### ✅ Webhooks Handler (ol-010)

Real-time content change detection via Shopify webhooks:
- Subscribe to Shopify webhooks (PRODUCTS_UPDATE, COLLECTIONS_UPDATE, etc.)
- Automatic content hash updates when webhooks are received
- Mark outdated translations when source content changes
- Optional auto-trigger translation jobs for changed content
- Webhook registration and management

See [docs/webhooks-handler.md](docs/webhooks-handler.md) for detailed documentation.

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
│   ├── content-hash.ts    # Content hash repository
│   └── sync-status.ts     # Sync status tracking
├── webhooks/
│   ├── handler.ts         # Webhook processing
│   ├── registry.ts        # Webhook subscription management
│   └── index.ts           # Webhooks exports
└── index.ts               # Main exports

tests/
├── shopify-fetcher.test.ts
├── content-hash.test.ts
├── sync-status.test.ts
├── webhook-handler.test.ts
└── webhook-registry.test.ts

examples/
├── fetch-content.ts       # Shopify fetcher example
├── content-hash-system.ts # Content hash system example
└── webhooks-example.ts    # Webhooks handler example

docs/
├── shopify-content-fetcher.md
├── content-hash-system.md
└── webhooks-handler.md
```

## Environment Variables

```bash
SHOPIFY_SHOP="your-store.myshopify.com"
SHOPIFY_ACCESS_TOKEN="your-admin-api-access-token"
DATABASE_URL="postgresql://user:password@localhost:5432/ownlingo"
```

## Usage Example

```typescript
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
  SyncStatusRepository,
  PrismaClient,
} from './src/index';

const prisma = new PrismaClient();

// Create Shopify client
const client = new ShopifyGraphQLClient({
  shop: 'your-store.myshopify.com',
  accessToken: 'your-access-token',
});

// Fetch content from Shopify
const fetcher = new ShopifyContentFetcher(client);
const resources = await fetcher.fetchAllTranslatableResources({
  resourceTypes: ['PRODUCT', 'COLLECTION'],
  pageSize: 50,
});

// Detect content changes
const contentRepo = new ContentHashRepository(prisma);
const stats = await contentRepo.storeTranslatableResources(shopId, resources);
console.log(`New: ${stats.newContent}, Changed: ${stats.changedContent}`);

// Find outdated translations
const syncRepo = new SyncStatusRepository(prisma);
const outdated = await syncRepo.getOutdatedTranslations(shopId, 'fr');
console.log(`Outdated French translations: ${outdated.length}`);

// Get dashboard statistics
const agg = await syncRepo.getSyncAggregation(shopId);
console.log(`Synced: ${agg.synced}/${agg.total}`);
```

## Roadmap

- [x] ol-001: Database Schema
- [x] ol-003: Shopify Content Fetcher
- [x] ol-004: Content Hash System
- [ ] ol-005: Translation Job Runner
- [ ] ol-006: Shopify Translation Push
- [ ] ol-007: AI Provider Integration
- [ ] ol-008: Translation Quality Checks
- [x] ol-010: Webhooks Handler

## License

ISC

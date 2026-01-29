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
└── index.ts               # Main exports

tests/
├── shopify-fetcher.test.ts
└── content-hash.test.ts

examples/
└── fetch-content.ts       # Usage example

docs/
└── shopify-content-fetcher.md
```

## Environment Variables

```bash
SHOPIFY_SHOP="your-store.myshopify.com"
SHOPIFY_ACCESS_TOKEN="your-admin-api-access-token"
DATABASE_URL="postgresql://user:password@localhost:5432/ownlingo"
```

## Usage Example

```typescript
import { ShopifyGraphQLClient, ShopifyContentFetcher } from './src/index';

// Create client
const client = new ShopifyGraphQLClient({
  shop: 'your-store.myshopify.com',
  accessToken: 'your-access-token',
});

// Fetch content
const fetcher = new ShopifyContentFetcher(client);
const resources = await fetcher.fetchAllTranslatableResources({
  resourceTypes: ['PRODUCT', 'COLLECTION'],
  pageSize: 50,
});

console.log(`Fetched ${resources.length} resources`);
```

## Roadmap

- [x] ol-001: Database Schema
- [x] ol-003: Shopify Content Fetcher
- [ ] ol-004: Content Hash System
- [ ] ol-005: Translation Job Runner
- [ ] ol-006: Shopify Translation Push
- [ ] ol-007: AI Provider Integration
- [ ] ol-008: Translation Quality Checks

## License

ISC

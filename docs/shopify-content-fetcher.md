# Shopify Content Fetcher

The Shopify Content Fetcher is a module for retrieving translatable content from Shopify stores via the GraphQL Admin API.

## Features

- ✅ Fetch all translatable resources using Shopify's `translatableResources` query
- ✅ Support for multiple content types:
  - Products (title, description, metafields)
  - Collections (title, description)
  - Pages (title, body)
  - Blog posts/Articles (title, content)
  - Navigation menus
  - Theme content (when accessible)
- ✅ Automatic pagination handling for large stores
- ✅ Content change detection using SHA-256 hashing
- ✅ Efficient storage in PostgreSQL via Prisma
- ✅ Comprehensive test coverage

## Architecture

```
┌──────────────────────────┐
│  ShopifyGraphQLClient    │  ← Handles API communication
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  ShopifyContentFetcher   │  ← Fetches translatable resources
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  ContentHashRepository   │  ← Stores content and detects changes
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  PostgreSQL Database     │  ← Persistent storage
└──────────────────────────┘
```

## Usage

### 1. Setup

Install dependencies:
```bash
npm install
npm run db:generate  # Generate Prisma client
```

Set environment variables:
```bash
export SHOPIFY_SHOP="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="your-admin-api-access-token"
export DATABASE_URL="postgresql://user:password@localhost:5432/ownlingo"
```

### 2. Basic Usage

```typescript
import { PrismaClient } from '@prisma/client';
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
} from './src/index';

const prisma = new PrismaClient();

// Create Shopify client
const client = new ShopifyGraphQLClient({
  shop: 'your-store.myshopify.com',
  accessToken: 'your-access-token',
  apiVersion: '2024-01',
});

// Create fetcher
const fetcher = new ShopifyContentFetcher(client);

// Fetch all translatable resources
const resources = await fetcher.fetchAllTranslatableResources({
  resourceTypes: ['PRODUCT', 'COLLECTION', 'PAGE', 'ARTICLE'],
  pageSize: 50,
  maxPages: 10,
});

console.log(`Fetched ${resources.length} resources`);
```

### 3. Store Content in Database

```typescript
const repository = new ContentHashRepository(prisma);

// Ensure shop exists
const shop = await prisma.shop.upsert({
  where: { domain: client.getShop() },
  update: {},
  create: { domain: client.getShop() },
});

// Store resources
const result = await repository.storeTranslatableResources(
  shop.id,
  resources
);

console.log({
  totalProcessed: result.totalProcessed,
  newContent: result.newContent,
  changedContent: result.changedContent,
  unchangedContent: result.unchangedContent,
});
```

### 4. Fetch Specific Resource Types

```typescript
// Fetch only products
const products = await fetcher.fetchTranslatableResourcesByType('PRODUCT');

// Fetch product details
const productDetails = await fetcher.fetchProductDetails('gid://shopify/Product/123');

// Fetch navigation menus
const menus = await fetcher.fetchMenus();
```

### 5. Check for Content Changes

```typescript
const hasChanged = await repository.hasContentChanged(
  shopId,
  'product',
  'gid://shopify/Product/123',
  'title',
  'New Product Title'
);

if (hasChanged) {
  console.log('Content has changed - translation needed');
}
```

## API Reference

### ShopifyGraphQLClient

#### Constructor
```typescript
constructor(config: ShopifyConfig)
```

**Parameters:**
- `config.shop` - Shopify store domain (e.g., "mystore.myshopify.com")
- `config.accessToken` - Admin API access token
- `config.apiVersion` - API version (default: "2024-01")

#### Methods
- `query<T>(query: string, variables?: Record<string, any>): Promise<T>` - Execute GraphQL query

### ShopifyContentFetcher

#### Constructor
```typescript
constructor(client: ShopifyGraphQLClient)
```

#### Methods

##### fetchAllTranslatableResources
```typescript
async fetchAllTranslatableResources(options?: FetchOptions): Promise<TranslatableResource[]>
```

Fetch all translatable resources for specified resource types.

**Options:**
- `resourceTypes` - Array of resource types to fetch (default: all types)
- `pageSize` - Number of items per page (default: 50)
- `maxPages` - Maximum pages to fetch (default: 100)

##### fetchTranslatableResourcesByType
```typescript
async fetchTranslatableResourcesByType(
  resourceType: ResourceType,
  pageSize?: number,
  maxPages?: number
): Promise<TranslatableResource[]>
```

Fetch translatable resources for a specific type with pagination.

##### fetchProductDetails / fetchCollectionDetails / fetchPageDetails / fetchArticleDetails
```typescript
async fetchProductDetails(productId: string): Promise<any>
```

Fetch detailed information for a specific resource.

##### fetchMenus
```typescript
async fetchMenus(): Promise<any>
```

Fetch navigation menus.

### ContentHashRepository

#### Constructor
```typescript
constructor(prisma: PrismaClient)
```

#### Methods

##### upsertContentHash
```typescript
async upsertContentHash(
  shopId: string,
  resourceType: string,
  resourceId: string,
  fieldName: string,
  content: string
): Promise<{
  id: string;
  hash: string;
  isNew: boolean;
  hasChanged: boolean;
}>
```

Store or update content hash for a resource field.

##### storeTranslatableResources
```typescript
async storeTranslatableResources(
  shopId: string,
  resources: TranslatableResource[]
): Promise<{
  totalProcessed: number;
  newContent: number;
  changedContent: number;
  unchangedContent: number;
}>
```

Store multiple translatable resources.

##### getContentHashesByShop
```typescript
async getContentHashesByShop(
  shopId: string,
  resourceType?: string
): Promise<ContentHash[]>
```

Get all content hashes for a shop, optionally filtered by resource type.

##### hasContentChanged
```typescript
async hasContentChanged(
  shopId: string,
  resourceType: string,
  resourceId: string,
  fieldName: string,
  newContent: string
): Promise<boolean>
```

Check if content has changed since last fetch.

## Pagination

The fetcher automatically handles pagination using Shopify's cursor-based pagination:

1. Fetches first page of results
2. Checks `pageInfo.hasNextPage`
3. Uses `pageInfo.endCursor` to fetch next page
4. Continues until all pages fetched or `maxPages` limit reached

## Content Change Detection

Content changes are detected using SHA-256 hashing:

1. When content is fetched, a hash is computed
2. Hash is compared with stored hash in database
3. If hash differs, content has changed
4. This triggers re-translation workflow

## Testing

Run tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- shopify-fetcher.test.ts
```

## Performance Considerations

- **Pagination**: Default page size is 50 items. Adjust based on your needs.
- **Rate limiting**: Shopify has API rate limits. Consider implementing retry logic.
- **Large stores**: Use `maxPages` to limit initial fetch, then incrementally fetch more.
- **Database indexes**: The schema includes indexes on `shopId`, `resourceType`, and `hash` for efficient queries.

## Error Handling

The fetcher throws errors for:
- Invalid Shopify credentials
- Network failures
- GraphQL query errors
- Database connection issues

Wrap calls in try-catch blocks:

```typescript
try {
  const resources = await fetcher.fetchAllTranslatableResources();
} catch (error) {
  console.error('Failed to fetch resources:', error);
  // Handle error appropriately
}
```

## Next Steps

This module provides the foundation for:
- **ol-004: Content Hash System** - Change detection and translation triggers
- **ol-005: Translation Job Runner** - Batch translation processing
- **ol-006: Shopify Translation Push** - Pushing translated content back to Shopify

See the project roadmap for details.

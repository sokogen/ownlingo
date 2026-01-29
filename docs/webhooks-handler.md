# Webhooks Handler

The Webhooks Handler provides automatic change detection and content synchronization for Ownlingo via Shopify webhooks. It listens for content updates from Shopify and automatically updates content hashes and marks outdated translations.

## Overview

The system enables:

- **Real-time change detection**: Automatically detect when Shopify content changes
- **Webhook registration**: Subscribe to Shopify webhook topics
- **Automatic hash updates**: Update content hashes when webhooks are received
- **Translation queue management**: Optionally trigger re-translation for outdated content
- **Efficient processing**: Process only changed content, not full syncs

## Architecture

The webhooks system consists of two main components:

### 1. WebhookHandler

Processes webhook payloads and updates content:

```typescript
import { PrismaClient } from '@prisma/client';
import { WebhookHandler } from './webhooks/handler';
import { ShopifyContentFetcher } from './shopify/fetcher';

const prisma = new PrismaClient();
const fetcher = new ShopifyContentFetcher(shopifyClient);

const handler = new WebhookHandler(prisma, fetcher, {
  shopId: 'shop-123',
  autoTriggerTranslation: true,
});
```

**Key Methods:**

- `handleWebhook(topic, payload)` - Process a webhook from Shopify
- Returns `WebhookProcessResult` with success status and affected translations

### 2. WebhookRegistry

Manages webhook subscriptions with Shopify:

```typescript
import { WebhookRegistry } from './webhooks/registry';

const registry = new WebhookRegistry(shopifyClient);
```

**Key Methods:**

- `registerWebhooks(options)` - Subscribe to webhook topics
- `listWebhookSubscriptions()` - List current subscriptions
- `deleteWebhookSubscription(id)` - Remove a subscription
- `deleteAllWebhookSubscriptions()` - Remove all subscriptions
- `webhookExists(topic, url)` - Check if subscription exists

## Supported Webhook Topics

The handler supports the following Shopify webhook topics:

| Topic | Description |
|-------|-------------|
| `products/update` | Product content was updated |
| `products/delete` | Product was deleted |
| `collections/update` | Collection content was updated |
| `collections/delete` | Collection was deleted |

**GraphQL Topic Names** (for registration):
- `PRODUCTS_UPDATE`
- `PRODUCTS_DELETE`
- `COLLECTIONS_UPDATE`
- `COLLECTIONS_DELETE`

## Usage Examples

### Registering Webhooks

```typescript
import { WebhookRegistry } from './webhooks/registry';
import { ShopifyGraphQLClient } from './shopify/client';

const client = new ShopifyGraphQLClient({
  shopDomain: 'your-shop.myshopify.com',
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
  apiVersion: '2024-01',
});

const registry = new WebhookRegistry(client);

// Register webhooks for products and collections
const subscriptions = await registry.registerWebhooks({
  topics: ['PRODUCTS_UPDATE', 'COLLECTIONS_UPDATE'],
  callbackUrl: 'https://your-app.com/webhooks/shopify',
});

console.log(`Registered ${subscriptions.length} webhooks`);
subscriptions.forEach(sub => {
  console.log(`  ${sub.topic} -> ${sub.endpoint}`);
});
```

### Checking Existing Webhooks

```typescript
// List all webhook subscriptions
const subscriptions = await registry.listWebhookSubscriptions();

console.log('Active webhooks:');
subscriptions.forEach(sub => {
  console.log(`  ${sub.topic}: ${sub.endpoint}`);
});

// Check if specific webhook exists
const exists = await registry.webhookExists(
  'PRODUCTS_UPDATE',
  'https://your-app.com/webhooks/shopify'
);

if (!exists) {
  console.log('Webhook not registered, registering now...');
  await registry.registerWebhooks({
    topics: ['PRODUCTS_UPDATE'],
    callbackUrl: 'https://your-app.com/webhooks/shopify',
  });
}
```

### Processing Webhooks

```typescript
import express from 'express';
import { WebhookHandler } from './webhooks/handler';

const app = express();
app.use(express.json());

const handler = new WebhookHandler(prisma, fetcher, {
  shopId: 'shop-123',
  autoTriggerTranslation: true,
});

app.post('/webhooks/shopify', async (req, res) => {
  try {
    // Verify webhook (implementation depends on your setup)
    // See Shopify docs for HMAC verification

    const topic = req.headers['x-shopify-topic'];
    const payload = req.body;

    // Process webhook
    const result = await handler.handleWebhook(
      topic as any,
      payload
    );

    if (result.success) {
      console.log(`Processed ${topic} for ${result.resourceId}`);
      console.log(`  Content changed: ${result.hasChanged}`);
      console.log(`  Affected translations: ${result.affectedTranslations || 0}`);

      res.status(200).json({ success: true });
    } else {
      console.error(`Webhook processing failed: ${result.error}`);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### With Auto-Translation

```typescript
// Enable automatic translation queue
const handler = new WebhookHandler(prisma, fetcher, {
  shopId: 'shop-123',
  autoTriggerTranslation: true, // Auto-queue translations
});

// When content changes, translations are automatically marked as PENDING
const result = await handler.handleWebhook('products/update', payload);

if (result.affectedTranslations > 0) {
  console.log(`Queued ${result.affectedTranslations} translations for update`);
}

// Query pending translations
const pending = await prisma.translation.findMany({
  where: {
    status: 'PENDING',
  },
});

// Process translation jobs
for (const translation of pending) {
  await processTranslationJob(translation);
}
```

### Without Auto-Translation

```typescript
// Disable auto-translation for manual control
const handler = new WebhookHandler(prisma, fetcher, {
  shopId: 'shop-123',
  autoTriggerTranslation: false,
});

const result = await handler.handleWebhook('products/update', payload);

if (result.hasChanged && result.affectedTranslations > 0) {
  console.log(`${result.affectedTranslations} translations affected`);

  // Manual decision: trigger batch translation later
  await scheduleTranslationBatch(result.resourceId);
}
```

## Webhook Workflow

### Product Update Flow

```
1. Shopify sends webhook: products/update
   ↓
2. WebhookHandler receives payload
   ↓
3. Fetch updated product from Shopify API
   ↓
4. Extract translatable fields (title, description, SEO)
   ↓
5. Update content hashes
   ↓
6. Detect which hashes changed
   ↓
7. Find completed translations for changed content
   ↓
8. [Optional] Mark translations as PENDING
   ↓
9. Return result with affected translation count
```

### Content Hash Update Logic

```typescript
// For each translatable field:
const result = await contentRepo.upsertContentHash(
  shopId,
  'product',
  'gid://shopify/Product/123',
  'title',
  'Updated Product Title'
);

if (result.hasChanged) {
  // Content changed - find and update translations
  const translations = await prisma.translation.findMany({
    where: {
      contentHashId: result.id,
      status: 'COMPLETED',
    },
  });

  // These translations are now outdated
  // (contentHash.updatedAt > translation.updatedAt)
}
```

## Translatable Fields

The handler extracts the following fields from each resource type:

### Products
- `title` - Product title
- `description` - Product description (HTML or plain text)
- `seoTitle` - SEO meta title
- `seoDescription` - SEO meta description

### Collections
- `title` - Collection title
- `description` - Collection description (HTML or plain text)
- `seoTitle` - SEO meta title
- `seoDescription` - SEO meta description

## Error Handling

The handler gracefully handles errors and returns detailed results:

```typescript
const result = await handler.handleWebhook(topic, payload);

if (!result.success) {
  console.error('Webhook processing failed');
  console.error('Error:', result.error);
  console.error('Resource:', result.resourceId);

  // Log to error tracking service
  await logError({
    context: 'webhook_processing',
    topic,
    resourceId: result.resourceId,
    error: result.error,
  });

  // Respond with 200 to Shopify to avoid retries
  // (if error is in our processing, not webhook delivery)
  return res.status(200).json({ success: false });
}
```

## Testing

Run webhook tests:

```bash
npm test tests/webhook-handler.test.ts
npm test tests/webhook-registry.test.ts
```

Run with coverage:

```bash
npm test -- --coverage tests/webhook-*.test.ts
```

See test files for comprehensive examples:
- [WebhookHandler tests](../tests/webhook-handler.test.ts)
- [WebhookRegistry tests](../tests/webhook-registry.test.ts)

## Security Considerations

### Webhook Verification

Always verify webhook authenticity using HMAC:

```typescript
import crypto from 'crypto';

function verifyShopifyWebhook(body: string, hmac: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return hash === hmac;
}

app.post('/webhooks/shopify', express.raw({ type: 'application/json' }), (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = req.body.toString('utf8');

  if (!verifyShopifyWebhook(body, hmac, process.env.SHOPIFY_WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
});
```

### Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

app.post('/webhooks/shopify', webhookLimiter, async (req, res) => {
  // Process webhook
});
```

## Integration with Content Hash System

The webhooks handler integrates seamlessly with the [Content Hash System](./content-hash-system.md):

```typescript
import { WebhookHandler } from './webhooks/handler';
import { SyncStatusRepository } from './db/sync-status';

const handler = new WebhookHandler(prisma, fetcher, {
  shopId: 'shop-123',
  autoTriggerTranslation: true,
});

// Process webhook
await handler.handleWebhook('products/update', payload);

// Query outdated translations
const syncRepo = new SyncStatusRepository(prisma);
const outdated = await syncRepo.getOutdatedTranslations('shop-123');

console.log(`${outdated.length} translations need updating`);

// Get sync statistics
const stats = await syncRepo.getSyncAggregation('shop-123');
console.log(`Sync status: ${stats.synced}/${stats.total} up-to-date`);
```

## Performance Considerations

### Webhook Throughput

- **Single webhook**: <100ms processing time
- **Batch updates**: Use bulk Shopify operations, trigger single webhook
- **High volume**: Consider queuing webhooks for async processing

### Database Impact

- Upsert operations are efficient (indexed unique constraints)
- Translation queries use existing indexes
- Consider pagination for shops with many translations

### Monitoring

Track webhook processing:

```typescript
const result = await handler.handleWebhook(topic, payload);

// Log metrics
await metrics.record({
  metric: 'webhook_processed',
  topic,
  success: result.success,
  hasChanged: result.hasChanged,
  affectedTranslations: result.affectedTranslations || 0,
  duration: Date.now() - startTime,
});
```

## See Also

- [Content Hash System](./content-hash-system.md) - Change detection foundation
- [Shopify Content Fetcher](./shopify-content-fetcher.md) - Fetching content from Shopify
- [Database Schema](../prisma/schema.prisma) - Complete schema reference
- [Example Usage](../examples/webhooks-example.ts) - Complete working example

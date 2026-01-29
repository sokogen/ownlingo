# Shopify Translation Pusher

Push translated content back to Shopify using the `translationsRegister` mutation.

## Overview

The Shopify Translation Pusher is part of the ownlingo translation system that handles pushing completed translations back to Shopify. It provides:

- Batch processing for efficient bulk updates
- Automatic retry with exponential backoff
- Per-resource error handling
- Translation verification
- Progress tracking

## Features

### Batch Processing

Process multiple resources efficiently with configurable batch sizes:

```typescript
const batches: TranslationBatch[] = [
  {
    resourceId: 'gid://shopify/Product/123',
    translations: [
      { key: 'title', value: 'Translated Title', locale: 'fr' },
      { key: 'description', value: 'Translated Description', locale: 'fr' },
    ],
  },
  // ... more resources
];

await pusher.pushBatch(batches, {
  batchSize: 50,
  onProgress: (progress) => {
    console.log(`${progress.percentage}% complete`);
  },
});
```

### Error Handling

Errors are handled per-resource, allowing partial success:

```typescript
const result = await pusher.pushResourceTranslations(resourceId, translations);

if (!result.success) {
  result.errors.forEach((error) => {
    console.error(`${error.message} at ${error.field.join('.')}`);
  });
}
```

### Automatic Retry

Failed requests are automatically retried with exponential backoff:

```typescript
await pusher.pushResourceTranslations(resourceId, translations, {
  retryAttempts: 3,
  retryDelay: 1000, // ms
});
```

### Translation Verification

Verify that translations were successfully applied:

```typescript
const verification = await pusher.verifyTranslations(resourceId, expectedTranslations);

if (!verification.verified) {
  console.log('Mismatches:', verification.mismatches);
}
```

## API Reference

### ShopifyTranslationPusher

#### Constructor

```typescript
new ShopifyTranslationPusher(client: ShopifyGraphQLClient)
```

#### Methods

##### `pushResourceTranslations()`

Push translations for a single resource.

```typescript
async pushResourceTranslations(
  resourceId: string,
  translations: TranslationInput[],
  options?: PushOptions
): Promise<PushResult>
```

**Parameters:**
- `resourceId`: Shopify resource GID (e.g., `gid://shopify/Product/123`)
- `translations`: Array of translations to push
- `options`: Optional configuration

**Returns:**
- `PushResult` containing success status, translation count, and errors

##### `pushBatch()`

Push translations for multiple resources in batches.

```typescript
async pushBatch(
  batches: TranslationBatch[],
  options?: PushOptions
): Promise<PushResult[]>
```

**Parameters:**
- `batches`: Array of resource batches to process
- `options`: Optional configuration including `batchSize` and `onProgress`

**Returns:**
- Array of `PushResult` for each resource

##### `verifyTranslations()`

Verify that translations were successfully applied.

```typescript
async verifyTranslations(
  resourceId: string,
  expectedTranslations: TranslationInput[]
): Promise<{
  verified: boolean;
  mismatches: Array<{
    key: string;
    locale: string;
    expected: string;
    actual: string | null;
  }>;
}>
```

**Parameters:**
- `resourceId`: Shopify resource GID
- `expectedTranslations`: Translations that should be present

**Returns:**
- Verification result with mismatches if any

##### `getSummary()`

Get summary statistics from push results.

```typescript
getSummary(results: PushResult[]): {
  total: number;
  successful: number;
  failed: number;
  totalTranslations: number;
  errors: UserError[];
}
```

**Parameters:**
- `results`: Array of push results

**Returns:**
- Summary statistics

## Types

### TranslationInput

```typescript
interface TranslationInput {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest?: string;
}
```

### TranslationBatch

```typescript
interface TranslationBatch {
  resourceId: string;
  translations: TranslationInput[];
}
```

### PushOptions

```typescript
interface PushOptions {
  batchSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
  onProgress?: (progress: PushProgress) => void;
}
```

### PushResult

```typescript
interface PushResult {
  resourceId: string;
  success: boolean;
  translationsCount: number;
  errors: UserError[];
}
```

### PushProgress

```typescript
interface PushProgress {
  total: number;
  completed: number;
  failed: number;
  percentage: number;
}
```

## Usage Example

See `examples/push-translations.ts` for a complete working example.

```typescript
import { ShopifyGraphQLClient, ShopifyTranslationPusher } from 'ownlingo';

const client = new ShopifyGraphQLClient({
  shopDomain: 'your-shop.myshopify.com',
  accessToken: 'your-access-token',
});

const pusher = new ShopifyTranslationPusher(client);

const result = await pusher.pushResourceTranslations(
  'gid://shopify/Product/123',
  [
    {
      key: 'title',
      value: 'Translated Title',
      locale: 'fr',
    },
  ]
);

console.log('Success:', result.success);
```

## Integration with Translation System

The Translation Pusher integrates with:

1. **Shopify Content Fetcher** (ol-x0e) - Provides source content and resource IDs
2. **Translation Job Runner** (ol-z56) - Generates translations to push

Typical workflow:

1. Fetch translatable content from Shopify (Content Fetcher)
2. Run translation jobs (Job Runner)
3. Push completed translations back to Shopify (Translation Pusher)
4. Verify translations were applied (Translation Pusher)

## Error Handling

The pusher handles errors gracefully:

- **Network errors**: Automatic retry with exponential backoff
- **Validation errors**: Returned in `PushResult.errors`
- **Rate limiting**: Delays between batch chunks
- **Partial failures**: Per-resource error tracking

## Best Practices

1. **Batch size**: Use 50-100 resources per batch for optimal performance
2. **Progress tracking**: Implement `onProgress` callback for long-running operations
3. **Error logging**: Log all errors for debugging and monitoring
4. **Verification**: Always verify critical translations after pushing
5. **Retry strategy**: Use 3 retry attempts with 1000ms initial delay

## Testing

Run tests with:

```bash
npm test
```

Tests cover:
- Single resource push
- Batch processing
- Error handling
- Retry logic
- Translation verification
- Progress tracking

## Dependencies

- `@shopify/shopify-api`: Shopify API types and utilities
- `graphql-request`: GraphQL client for mutations
- Shopify Admin API access with translation permissions

## License

ISC

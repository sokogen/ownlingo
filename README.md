# ownlingo

Shopify content translation system with automated translation push capabilities.

## Features

- **Shopify Translation Push** (ol-fy8): Push translated content back to Shopify
  - Batch processing for efficient bulk updates
  - Automatic retry with exponential backoff
  - Per-resource error handling
  - Translation verification
  - Progress tracking

## Quick Start

```typescript
import { ShopifyGraphQLClient, ShopifyTranslationPusher } from 'ownlingo';

// Initialize client
const client = new ShopifyGraphQLClient({
  shopDomain: 'your-shop.myshopify.com',
  accessToken: 'your-access-token',
});

// Push translations
const pusher = new ShopifyTranslationPusher(client);
const result = await pusher.pushResourceTranslations(
  'gid://shopify/Product/123',
  [
    { key: 'title', value: 'Translated Title', locale: 'fr' },
    { key: 'description', value: 'Translated Description', locale: 'fr' },
  ]
);
```

## Documentation

- [Shopify Translation Pusher](docs/shopify-translation-pusher.md)

## Examples

See the `examples/` directory for complete usage examples:
- `examples/push-translations.ts` - Pushing translations to Shopify

## Installation

```bash
npm install
npm run db:generate
```

## Testing

```bash
npm test
```

## License

ISC

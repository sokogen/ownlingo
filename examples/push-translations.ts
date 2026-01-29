/**
 * Example: Pushing translations to Shopify
 * ol-fy8: Shopify Translation Push
 */

import {
  ShopifyGraphQLClient,
  ShopifyTranslationPusher,
  TranslationBatch,
  PushProgress,
} from '../src';

async function main() {
  // Initialize Shopify client
  const client = new ShopifyGraphQLClient({
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || 'your-shop.myshopify.com',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'your-access-token',
    apiVersion: '2024-01',
  });

  // Initialize translation pusher
  const pusher = new ShopifyTranslationPusher(client);

  // Example 1: Push translations for a single resource
  console.log('\n=== Example 1: Single Resource ===\n');

  const singleResult = await pusher.pushResourceTranslations(
    'gid://shopify/Product/123456789',
    [
      {
        key: 'title',
        value: 'Produit Exemple',
        locale: 'fr',
      },
      {
        key: 'description',
        value: 'Ceci est une description traduite',
        locale: 'fr',
      },
    ]
  );

  console.log('Single resource result:', {
    success: singleResult.success,
    resourceId: singleResult.resourceId,
    translationsCount: singleResult.translationsCount,
    errors: singleResult.errors,
  });

  // Example 2: Push translations in batches with progress tracking
  console.log('\n=== Example 2: Batch Push with Progress ===\n');

  const batches: TranslationBatch[] = [
    {
      resourceId: 'gid://shopify/Product/111',
      translations: [
        { key: 'title', value: 'Título de Producto 1', locale: 'es' },
        { key: 'description', value: 'Descripción del producto 1', locale: 'es' },
      ],
    },
    {
      resourceId: 'gid://shopify/Product/222',
      translations: [
        { key: 'title', value: 'Título de Producto 2', locale: 'es' },
        { key: 'description', value: 'Descripción del producto 2', locale: 'es' },
      ],
    },
    {
      resourceId: 'gid://shopify/Collection/333',
      translations: [
        { key: 'title', value: 'Colección de Ejemplo', locale: 'es' },
        { key: 'description', value: 'Descripción de la colección', locale: 'es' },
      ],
    },
  ];

  const batchResults = await pusher.pushBatch(batches, {
    batchSize: 10,
    retryAttempts: 3,
    retryDelay: 1000,
    onProgress: (progress: PushProgress) => {
      console.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
    },
  });

  console.log('\nBatch push complete!');

  // Get summary statistics
  const summary = pusher.getSummary(batchResults);
  console.log('\nSummary:', {
    total: summary.total,
    successful: summary.successful,
    failed: summary.failed,
    totalTranslations: summary.totalTranslations,
    errors: summary.errors.length,
  });

  // Example 3: Verify translations were applied
  console.log('\n=== Example 3: Verify Translations ===\n');

  const verification = await pusher.verifyTranslations(
    'gid://shopify/Product/123456789',
    [
      {
        key: 'title',
        value: 'Produit Exemple',
        locale: 'fr',
      },
      {
        key: 'description',
        value: 'Ceci est une description traduite',
        locale: 'fr',
      },
    ]
  );

  console.log('Verification result:', {
    verified: verification.verified,
    mismatchCount: verification.mismatches.length,
  });

  if (!verification.verified) {
    console.log('Mismatches found:');
    verification.mismatches.forEach((mismatch) => {
      console.log(`  - Key: ${mismatch.key}, Locale: ${mismatch.locale}`);
      console.log(`    Expected: ${mismatch.expected}`);
      console.log(`    Actual: ${mismatch.actual}`);
    });
  }

  // Example 4: Handle errors gracefully
  console.log('\n=== Example 4: Error Handling ===\n');

  const errorResults = await pusher.pushBatch(
    [
      {
        resourceId: 'gid://shopify/Product/invalid',
        translations: [
          { key: 'title', value: 'Test', locale: 'invalid-locale' },
        ],
      },
    ],
    {
      retryAttempts: 2,
      retryDelay: 500,
    }
  );

  errorResults.forEach((result) => {
    if (!result.success) {
      console.log(`Failed to push translations for ${result.resourceId}:`);
      result.errors.forEach((error) => {
        console.log(`  - ${error.message} (field: ${error.field.join('.')})`);
      });
    }
  });
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

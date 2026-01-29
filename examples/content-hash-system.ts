/**
 * Example: Using the Content Hash System for Change Detection
 *
 * This example demonstrates:
 * 1. Fetching content from Shopify
 * 2. Detecting content changes via hash comparison
 * 3. Tracking sync status per locale
 * 4. Finding outdated and untranslated content
 * 5. Generating dashboard statistics
 */

import { PrismaClient } from '@prisma/client';
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
  SyncStatusRepository,
} from '../src/index';

async function main() {
  // Initialize clients
  const prisma = new PrismaClient();
  const shopifyClient = new ShopifyGraphQLClient({
    shop: process.env.SHOPIFY_SHOP || 'your-store.myshopify.com',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'your-access-token',
    apiVersion: '2024-01',
  });
  const fetcher = new ShopifyContentFetcher(shopifyClient);
  const contentRepo = new ContentHashRepository(prisma);
  const syncRepo = new SyncStatusRepository(prisma);

  // Get or create shop
  const shopDomain = process.env.SHOPIFY_SHOP || 'your-store.myshopify.com';
  let shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { domain: shopDomain },
    });
    console.log(`Created shop: ${shop.domain}`);
  }

  // Ensure languages exist
  const languages = await prisma.language.findMany({
    where: { shopId: shop.id },
  });

  if (languages.length === 0) {
    await prisma.language.createMany({
      data: [
        {
          shopId: shop.id,
          locale: 'en',
          name: 'English',
          isDefault: true,
          isEnabled: true,
        },
        {
          shopId: shop.id,
          locale: 'fr',
          name: 'French',
          isDefault: false,
          isEnabled: true,
        },
        {
          shopId: shop.id,
          locale: 'es',
          name: 'Spanish',
          isDefault: false,
          isEnabled: true,
        },
      ],
    });
    console.log('Created default languages: en, fr, es');
  }

  // ============================================================================
  // STEP 1: Fetch content from Shopify and detect changes
  // ============================================================================
  console.log('\n=== Fetching Shopify Content ===');

  const products = await fetcher.fetchTranslatableResourcesByType('PRODUCT', 10);
  console.log(`Fetched ${products.length} products`);

  // Store content and detect changes
  const stats = await contentRepo.storeTranslatableResources(shop.id, products);
  console.log('\nContent Statistics:');
  console.log(`  Total processed: ${stats.totalProcessed}`);
  console.log(`  New content: ${stats.newContent}`);
  console.log(`  Changed content: ${stats.changedContent}`);
  console.log(`  Unchanged content: ${stats.unchangedContent}`);

  // ============================================================================
  // STEP 2: Find untranslated content
  // ============================================================================
  console.log('\n=== Finding Untranslated Content ===');

  const untranslated = await syncRepo.getUntranslatedContent(
    shop.id,
    ['fr', 'es'],
    'product'
  );
  console.log(`Found ${untranslated.length} content items needing translation`);

  if (untranslated.length > 0) {
    const sample = untranslated[0];
    console.log('\nSample untranslated item:');
    console.log(`  Resource: ${sample.resourceType} - ${sample.resourceId}`);
    console.log(`  Field: ${sample.fieldName}`);
    console.log(`  Content: ${sample.content.substring(0, 50)}...`);
    console.log(`  Missing locales: ${sample.missingLocales.join(', ')}`);
  }

  // ============================================================================
  // STEP 3: Create some translations (simulated)
  // ============================================================================
  console.log('\n=== Simulating Translation Creation ===');

  // Get a content hash to translate
  const contentHashes = await contentRepo.getContentHashesByShop(
    shop.id,
    'product'
  );

  if (contentHashes.length > 0) {
    const sampleHash = contentHashes[0];
    const frLanguage = await prisma.language.findFirst({
      where: { shopId: shop.id, locale: 'fr' },
    });

    if (frLanguage) {
      // Create a translation
      await prisma.translation.create({
        data: {
          shopId: shop.id,
          languageId: frLanguage.id,
          contentHashId: sampleHash.id,
          translatedText: 'Translated text (simulated)',
          status: 'COMPLETED',
        },
      });
      console.log('Created sample French translation');
    }
  }

  // ============================================================================
  // STEP 4: Simulate content update and detect outdated translations
  // ============================================================================
  console.log('\n=== Simulating Content Update ===');

  if (contentHashes.length > 0) {
    const sampleHash = contentHashes[0];

    // Wait a moment to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update content (simulating Shopify content change)
    await contentRepo.upsertContentHash(
      shop.id,
      sampleHash.resourceType,
      sampleHash.resourceId,
      sampleHash.fieldName,
      sampleHash.content + ' [UPDATED]'
    );
    console.log('Updated content hash (simulated content change)');

    // Find outdated translations
    const outdated = await syncRepo.getOutdatedTranslations(shop.id, 'fr');
    console.log(`Found ${outdated.length} outdated French translations`);

    if (outdated.length > 0) {
      const sample = outdated[0];
      console.log('\nSample outdated translation:');
      console.log(`  Resource: ${sample.resourceType} - ${sample.resourceId}`);
      console.log(`  Field: ${sample.fieldName}`);
      console.log(`  Locale: ${sample.locale}`);
      console.log(`  Content updated: ${sample.contentUpdatedAt.toISOString()}`);
      console.log(
        `  Translation updated: ${sample.translationUpdatedAt.toISOString()}`
      );
    }
  }

  // ============================================================================
  // STEP 5: Get sync status for all translations
  // ============================================================================
  console.log('\n=== Checking All Sync Statuses ===');

  const allStatuses = await syncRepo.getAllSyncStatuses(shop.id);
  console.log(`Total translations: ${allStatuses.length}`);

  // Count by status
  const statusCounts = allStatuses.reduce(
    (acc, status) => {
      acc[status.syncStatus]++;
      return acc;
    },
    { synced: 0, outdated: 0, pending: 0, error: 0 }
  );

  console.log('\nSync Status Breakdown:');
  console.log(`  Synced: ${statusCounts.synced}`);
  console.log(`  Outdated: ${statusCounts.outdated}`);
  console.log(`  Pending: ${statusCounts.pending}`);
  console.log(`  Error: ${statusCounts.error}`);

  // ============================================================================
  // STEP 6: Generate dashboard aggregations
  // ============================================================================
  console.log('\n=== Dashboard Aggregations ===');

  // Overall aggregation
  const overallAgg = await syncRepo.getSyncAggregation(shop.id);
  console.log('\nOverall Statistics:');
  console.log(`  Total: ${overallAgg.total}`);
  console.log(`  Synced: ${overallAgg.synced} (${Math.round((overallAgg.synced / overallAgg.total) * 100)}%)`);
  console.log(`  Outdated: ${overallAgg.outdated} (${Math.round((overallAgg.outdated / overallAgg.total) * 100)}%)`);
  console.log(`  Pending: ${overallAgg.pending} (${Math.round((overallAgg.pending / overallAgg.total) * 100)}%)`);
  console.log(`  Error: ${overallAgg.error} (${Math.round((overallAgg.error / overallAgg.total) * 100)}%)`);

  // By locale
  console.log('\n--- By Locale ---');
  const byLocale = await syncRepo.getSyncAggregationByLocale(shop.id);
  for (const [locale, agg] of byLocale) {
    console.log(`\n${locale}:`);
    console.log(`  Total: ${agg.total}`);
    console.log(`  Synced: ${agg.synced}`);
    console.log(`  Outdated: ${agg.outdated}`);
    console.log(`  Pending: ${agg.pending}`);
    console.log(`  Error: ${agg.error}`);
  }

  // By resource type
  console.log('\n--- By Resource Type ---');
  const byResourceType = await syncRepo.getSyncAggregationByResourceType(
    shop.id
  );
  for (const [resourceType, agg] of byResourceType) {
    console.log(`\n${resourceType}:`);
    console.log(`  Total: ${agg.total}`);
    console.log(`  Synced: ${agg.synced}`);
    console.log(`  Outdated: ${agg.outdated}`);
    console.log(`  Pending: ${agg.pending}`);
    console.log(`  Error: ${agg.error}`);
  }

  // ============================================================================
  // STEP 7: Query specific scenarios
  // ============================================================================
  console.log('\n=== Specific Query Scenarios ===');

  // Find all product content that needs French translation
  const needsFrench = await syncRepo.getUntranslatedContent(
    shop.id,
    ['fr'],
    'product'
  );
  console.log(`\nProducts needing French translation: ${needsFrench.length}`);

  // Find outdated product translations in Spanish
  const outdatedSpanish = await syncRepo.getOutdatedTranslations(
    shop.id,
    'es',
    'product'
  );
  console.log(`Outdated Spanish product translations: ${outdatedSpanish.length}`);

  // Get sync status for specific resource type and locale
  const productFrenchStatuses = await syncRepo.getAllSyncStatuses(
    shop.id,
    'fr',
    'product'
  );
  console.log(
    `French product translation statuses: ${productFrenchStatuses.length}`
  );

  console.log('\n=== Example Complete ===');

  await prisma.$disconnect();
}

// Run the example
main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

/**
 * Example: Using the Content Hash System for change detection and sync status tracking
 *
 * This example demonstrates:
 * 1. Fetching content from Shopify
 * 2. Detecting content changes
 * 3. Tracking sync status per locale
 * 4. Finding untranslated/outdated content
 * 5. Getting dashboard metrics
 */

import { PrismaClient } from '@prisma/client';
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
  SyncStatusService,
} from '../src';

async function main() {
  const prisma = new PrismaClient();

  try {
    // Configuration (replace with your values)
    const SHOP_DOMAIN = 'mystore.myshopify.com';
    const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || 'your-token';
    const SHOP_ID = 'shop-123'; // Your shop ID in the database

    console.log('=== Content Hash System Example ===\n');

    // 1. Create a shop if it doesn't exist
    console.log('1. Setting up shop...');
    let shop = await prisma.shop.findUnique({ where: { domain: SHOP_DOMAIN } });
    if (!shop) {
      shop = await prisma.shop.create({
        data: { domain: SHOP_DOMAIN },
      });
      console.log(`   Created shop: ${shop.id}`);
    } else {
      console.log(`   Using existing shop: ${shop.id}`);
    }

    // 2. Create target languages if they don't exist
    console.log('\n2. Setting up languages...');
    const locales = [
      { locale: 'fr', name: 'French' },
      { locale: 'de', name: 'German' },
      { locale: 'es', name: 'Spanish' },
    ];

    for (const { locale, name } of locales) {
      const existing = await prisma.language.findUnique({
        where: { shopId_locale: { shopId: shop.id, locale } },
      });

      if (!existing) {
        await prisma.language.create({
          data: {
            shopId: shop.id,
            locale,
            name,
            isEnabled: true,
          },
        });
        console.log(`   Created language: ${name} (${locale})`);
      } else {
        console.log(`   Language exists: ${name} (${locale})`);
      }
    }

    // 3. Fetch content from Shopify
    console.log('\n3. Fetching content from Shopify...');
    const client = new ShopifyGraphQLClient({
      shop: SHOP_DOMAIN,
      accessToken: ACCESS_TOKEN,
    });

    const fetcher = new ShopifyContentFetcher(client);
    const resources = await fetcher.fetchAllTranslatableResources({
      resourceTypes: ['PRODUCT', 'COLLECTION'],
      pageSize: 10,
      maxPages: 1, // Limit for demo
    });

    console.log(`   Fetched ${resources.length} resources`);

    // 4. Store content and detect changes
    console.log('\n4. Storing content and detecting changes...');
    const contentHashRepo = new ContentHashRepository(prisma);
    const result = await contentHashRepo.storeTranslatableResources(shop.id, resources);

    console.log(`   Total processed: ${result.totalProcessed}`);
    console.log(`   New content: ${result.newContent}`);
    console.log(`   Changed content: ${result.changedContent}`);
    console.log(`   Unchanged content: ${result.unchangedContent}`);

    // 5. Get sync status for French locale
    console.log('\n5. Getting sync status for French (fr)...');
    const syncService = new SyncStatusService(prisma);
    const frStatuses = await syncService.getShopSyncStatus(shop.id, 'fr');

    console.log(`   Total content items: ${frStatuses.length}`);

    // Count by status
    const statusCounts = frStatuses.reduce(
      (acc, s) => {
        acc[s.syncStatus]++;
        return acc;
      },
      { synced: 0, outdated: 0, pending: 0, error: 0 }
    );

    console.log(`   Synced: ${statusCounts.synced}`);
    console.log(`   Outdated: ${statusCounts.outdated}`);
    console.log(`   Pending: ${statusCounts.pending}`);
    console.log(`   Error: ${statusCounts.error}`);

    // 6. Find untranslated content
    console.log('\n6. Finding untranslated content...');
    const untranslatedFr = await syncService.findUntranslated(shop.id, 'fr');
    console.log(`   Untranslated (fr): ${untranslatedFr.length} items`);

    if (untranslatedFr.length > 0) {
      console.log('\n   First 3 untranslated items:');
      untranslatedFr.slice(0, 3).forEach((item, idx) => {
        console.log(
          `   ${idx + 1}. ${item.resourceType}/${item.resourceId}/${item.fieldName}`
        );
      });
    }

    // 7. Find outdated content
    console.log('\n7. Finding outdated content...');
    const outdatedFr = await syncService.findOutdated(shop.id, 'fr');
    console.log(`   Outdated (fr): ${outdatedFr.length} items`);

    if (outdatedFr.length > 0) {
      console.log('\n   Outdated items (need retranslation):');
      outdatedFr.forEach((item, idx) => {
        console.log(
          `   ${idx + 1}. ${item.resourceType}/${item.resourceId}/${item.fieldName}`
        );
      });
    }

    // 8. Get aggregations for dashboard
    console.log('\n8. Getting dashboard metrics...');

    const aggFr = await syncService.getAggregation(shop.id, 'fr');
    console.log('\n   French (fr) aggregation:');
    console.log(`   - Synced: ${aggFr.synced}`);
    console.log(`   - Outdated: ${aggFr.outdated}`);
    console.log(`   - Pending: ${aggFr.pending}`);
    console.log(`   - Error: ${aggFr.error}`);
    console.log(`   - Total: ${aggFr.total}`);

    const progressFr = await syncService.getProgress(shop.id, 'fr');
    console.log(`\n   Translation progress (fr): ${progressFr}%`);

    // 9. Get aggregation by resource type
    console.log('\n9. Getting metrics by resource type...');
    const byType = await syncService.getAggregationByType(shop.id, 'fr');

    byType.forEach((typeAgg) => {
      console.log(`\n   ${typeAgg.resourceType.toUpperCase()}:`);
      console.log(`   - Synced: ${typeAgg.aggregation.synced}`);
      console.log(`   - Outdated: ${typeAgg.aggregation.outdated}`);
      console.log(`   - Pending: ${typeAgg.aggregation.pending}`);
      console.log(`   - Error: ${typeAgg.aggregation.error}`);
      console.log(`   - Total: ${typeAgg.aggregation.total}`);
    });

    // 10. Check multiple locales
    console.log('\n10. Checking all locales...');
    for (const { locale } of locales) {
      const progress = await syncService.getProgress(shop.id, locale);
      console.log(`   ${locale}: ${progress}% complete`);
    }

    console.log('\n=== Example completed successfully ===');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main };

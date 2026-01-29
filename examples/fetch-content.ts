/**
 * Example: Fetching Shopify Content
 *
 * This example demonstrates how to use the ShopifyContentFetcher
 * to retrieve translatable content from a Shopify store.
 */

import { PrismaClient } from '@prisma/client';
import {
  ShopifyGraphQLClient,
  ShopifyContentFetcher,
  ContentHashRepository,
} from '../src/index';

async function main() {
  // Initialize Prisma client
  const prisma = new PrismaClient();

  try {
    // 1. Create Shopify GraphQL client
    const shopifyClient = new ShopifyGraphQLClient({
      shop: process.env.SHOPIFY_SHOP || 'your-store.myshopify.com',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'your-access-token',
      apiVersion: '2024-01',
    });

    console.log(`Connected to shop: ${shopifyClient.getShop()}`);

    // 2. Create content fetcher
    const fetcher = new ShopifyContentFetcher(shopifyClient);

    // 3. Fetch all translatable resources
    console.log('Fetching translatable resources...');
    const resources = await fetcher.fetchAllTranslatableResources({
      resourceTypes: ['PRODUCT', 'COLLECTION', 'PAGE', 'ARTICLE'],
      pageSize: 50,
      maxPages: 10,
    });

    console.log(`Fetched ${resources.length} translatable resources`);

    // 4. Store content in database
    const repository = new ContentHashRepository(prisma);

    // First, ensure shop exists
    const shop = await prisma.shop.upsert({
      where: { domain: shopifyClient.getShop() },
      update: {},
      create: {
        domain: shopifyClient.getShop(),
      },
    });

    console.log('Storing content in database...');
    const storeResult = await repository.storeTranslatableResources(
      shop.id,
      resources
    );

    console.log('Storage results:', {
      totalProcessed: storeResult.totalProcessed,
      newContent: storeResult.newContent,
      changedContent: storeResult.changedContent,
      unchangedContent: storeResult.unchangedContent,
    });

    // 5. Fetch specific resource details
    const productResources = resources.filter(r => r.resourceType === 'PRODUCT');

    if (productResources.length > 0) {
      const firstProductId = productResources[0].resourceId;
      console.log(`\nFetching details for product: ${firstProductId}`);

      const productDetails = await fetcher.fetchProductDetails(firstProductId);
      console.log('Product details:', JSON.stringify(productDetails, null, 2));
    }

    // 6. Fetch navigation menus
    console.log('\nFetching navigation menus...');
    const menus = await fetcher.fetchMenus();
    console.log('Menus:', JSON.stringify(menus, null, 2));

    // 7. Check for changed content
    const contentHashes = await repository.getContentHashesByShop(shop.id, 'product');
    console.log(`\nFound ${contentHashes.length} product content hashes`);

    if (contentHashes.length > 0) {
      const firstHash = contentHashes[0];
      const hasChanged = await repository.hasContentChanged(
        shop.id,
        firstHash.resourceType,
        firstHash.resourceId,
        firstHash.fieldName,
        firstHash.content
      );
      console.log(`Content has changed: ${hasChanged}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

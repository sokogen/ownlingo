/**
 * Example: Shopify Webhooks Handler
 *
 * This example demonstrates how to:
 * 1. Register webhooks with Shopify
 * 2. Set up a webhook endpoint
 * 3. Process webhooks and detect content changes
 * 4. Automatically trigger translations for outdated content
 */

import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ShopifyGraphQLClient } from '../src/shopify/client';
import { ShopifyContentFetcher } from '../src/shopify/fetcher';
import { WebhookHandler } from '../src/webhooks/handler';
import { WebhookRegistry } from '../src/webhooks/registry';
import { SyncStatusRepository } from '../src/db/sync-status';

// Configuration
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'your-shop.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || 'your-access-token';
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || 'your-webhook-secret';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.com/webhooks/shopify';
const SHOP_ID = 'shop-123';

// Initialize clients
const prisma = new PrismaClient();
const shopifyClient = new ShopifyGraphQLClient({
  shopDomain: SHOPIFY_DOMAIN,
  accessToken: SHOPIFY_ACCESS_TOKEN,
  apiVersion: '2024-01',
});

const fetcher = new ShopifyContentFetcher(shopifyClient);
const registry = new WebhookRegistry(shopifyClient);
const syncRepo = new SyncStatusRepository(prisma);

// Initialize webhook handler with auto-translation enabled
const webhookHandler = new WebhookHandler(prisma, fetcher, {
  shopId: SHOP_ID,
  autoTriggerTranslation: true,
});

/**
 * Verify webhook authenticity using HMAC
 */
function verifyWebhook(body: string, hmac: string): boolean {
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  return hash === hmac;
}

/**
 * Register webhooks with Shopify
 */
async function registerWebhooks() {
  console.log('\n=== Registering Webhooks ===\n');

  // Check existing webhooks
  const existing = await registry.listWebhookSubscriptions();
  console.log(`Found ${existing.length} existing webhook(s)`);

  // Register new webhooks
  const topics = ['PRODUCTS_UPDATE', 'COLLECTIONS_UPDATE'] as const;

  for (const topic of topics) {
    const exists = await registry.webhookExists(topic, WEBHOOK_URL);

    if (exists) {
      console.log(`✓ ${topic} already registered`);
    } else {
      try {
        const subscription = await registry.registerWebhooks({
          topics: [topic],
          callbackUrl: WEBHOOK_URL,
        });
        console.log(`✓ Registered ${topic}`);
        console.log(`  ID: ${subscription[0].id}`);
        console.log(`  Endpoint: ${subscription[0].endpoint}`);
      } catch (error) {
        console.error(`✗ Failed to register ${topic}:`, error);
      }
    }
  }

  console.log('\nWebhook registration complete\n');
}

/**
 * Create Express server for webhook endpoint
 */
function createWebhookServer() {
  const app = express();

  // Parse raw body for HMAC verification
  app.use(
    express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Webhook endpoint
  app.post('/webhooks/shopify', async (req: any, res) => {
    const startTime = Date.now();

    try {
      // Extract headers
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;

      console.log(`\n=== Received Webhook ===`);
      console.log(`Topic: ${topic}`);
      console.log(`Shop: ${shopDomain}`);

      // Verify webhook
      if (!verifyWebhook(req.rawBody, hmac)) {
        console.error('✗ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log('✓ Signature verified');

      // Process webhook
      const payload = req.body;
      const result = await webhookHandler.handleWebhook(
        topic.toLowerCase().replace('/', '/') as any,
        payload
      );

      const duration = Date.now() - startTime;

      if (result.success) {
        console.log('✓ Webhook processed successfully');
        console.log(`  Resource: ${result.resourceType} ${result.resourceId}`);
        console.log(`  Content changed: ${result.hasChanged}`);
        console.log(`  Affected translations: ${result.affectedTranslations || 0}`);
        console.log(`  Duration: ${duration}ms`);

        // Get updated sync statistics
        if (result.hasChanged) {
          const stats = await syncRepo.getSyncAggregation(SHOP_ID);
          console.log(`  Sync status: ${stats.synced}/${stats.total} up-to-date`);
        }

        res.status(200).json({ success: true });
      } else {
        console.error('✗ Webhook processing failed');
        console.error(`  Error: ${result.error}`);
        console.error(`  Duration: ${duration}ms`);

        // Return 200 to avoid Shopify retries (error is in our processing)
        res.status(200).json({ success: false, error: result.error });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('✗ Webhook error:', error);
      console.error(`  Duration: ${duration}ms`);

      // Return 500 for unexpected errors (Shopify will retry)
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // List webhook subscriptions
  app.get('/webhooks/list', async (req, res) => {
    try {
      const subscriptions = await registry.listWebhookSubscriptions();
      res.json({ subscriptions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list webhooks' });
    }
  });

  // Sync status dashboard
  app.get('/sync/status', async (req, res) => {
    try {
      const overall = await syncRepo.getSyncAggregation(SHOP_ID);
      const byLocale = await syncRepo.getSyncAggregationByLocale(SHOP_ID);
      const byType = await syncRepo.getSyncAggregationByResourceType(SHOP_ID);

      res.json({
        overall,
        byLocale: Object.fromEntries(byLocale),
        byType: Object.fromEntries(byType),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  });

  return app;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('=== Ownlingo Webhooks Example ===\n');

    // Register webhooks
    await registerWebhooks();

    // Start webhook server
    const app = createWebhookServer();
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`\n=== Webhook Server Started ===`);
      console.log(`Listening on port ${PORT}`);
      console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/shopify`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Sync status: http://localhost:${PORT}/sync/status`);
      console.log(`\nWaiting for webhooks...\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await prisma.$disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main, registerWebhooks, createWebhookServer };

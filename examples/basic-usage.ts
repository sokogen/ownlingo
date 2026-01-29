// Example: Basic usage of ownlingo translation system

import { Schema, MockAIProvider, TranslationJobRunner, JobCreator, ContentHasher } from '../src';

async function main() {
  // Initialize database
  const schema = new Schema('./example.db');
  const db = schema.getDatabase();

  // Add sample resources
  const now = Date.now();
  const content1 = 'Welcome to our store';
  const content2 = 'Browse our products';

  const insertResource = db.prepare(`
    INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertResource.run('res1', 'shop_1', 'page', 'Home', content1, ContentHasher.hash({ text: content1 }), 'en', now, now);
  insertResource.run('res2', 'shop_2', 'page', 'Products', content2, ContentHasher.hash({ text: content2 }), 'en', now, now);

  console.log('✓ Sample resources added');

  // Set up AI provider
  const provider = new MockAIProvider();

  // Create job runner
  const runner = new TranslationJobRunner(db, provider, {
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelay: 1000,
    pollInterval: 2000,
  });

  // Create job creator
  const creator = new JobCreator(db);

  // Listen to events
  runner.on('started', () => {
    console.log('Job runner started');
  });

  runner.on('progress', (progress) => {
    console.log(`\nJob ${progress.jobId}:`);
    console.log(`  Progress: ${progress.progress.toFixed(1)}%`);
    console.log(`  Completed: ${progress.completed}/${progress.total}`);
    console.log(`  Failed: ${progress.failed}`);
  });

  runner.on('job:completed', ({ jobId }) => {
    console.log(`\n✓ Job ${jobId} completed successfully`);
  });

  runner.on('job:failed', ({ jobId, error }) => {
    console.error(`\n✗ Job ${jobId} failed:`, error);
  });

  runner.on('item:completed', ({ jobId, itemId }) => {
    console.log(`  ✓ Item ${itemId} translated`);
  });

  runner.on('item:cache-hit', ({ jobId, itemId }) => {
    console.log(`  ⚡ Item ${itemId} used cached translation`);
  });

  // Create translation jobs
  console.log('\nCreating translation jobs...');

  const fullJobId = creator.createJob({
    type: 'full',
    sourceLocale: 'en',
    targetLocales: ['fr', 'es'],
    priority: 1,
  });
  console.log(`Created full translation job: ${fullJobId}`);

  const singleJobId = creator.createJob({
    type: 'single',
    sourceLocale: 'en',
    targetLocales: ['de'],
    resourceId: 'res1',
    priority: 2,
  });
  console.log(`Created single translation job: ${singleJobId}`);

  // Start processing
  console.log('\nStarting job processing...\n');
  await runner.start();

  // Wait for jobs to complete
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Get final progress
  console.log('\n=== Final Results ===\n');
  const fullProgress = runner.getJobProgress(fullJobId);
  console.log('Full job:', fullProgress);

  const singleProgress = runner.getJobProgress(singleJobId);
  console.log('Single job:', singleProgress);

  // Stop runner
  await runner.stop();
  console.log('\nJob runner stopped');

  // Cleanup
  schema.close();
}

// Run example
main().catch(console.error);

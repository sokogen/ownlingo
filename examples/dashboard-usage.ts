// Example: Using Dashboard Service to monitor translation status and trigger jobs
// ol-008: Dashboard UI

import {
  Schema,
  MockAIProvider,
  DashboardService,
  JobCreator,
  TranslationJobRunner,
} from '../src/index';

async function dashboardExample() {
  // Initialize database and services
  const schema = new Schema('./dashboard-example.db');
  const db = schema.getDatabase();
  const provider = new MockAIProvider();

  const dashboard = new DashboardService(db);
  const jobCreator = new JobCreator(db);
  const jobRunner = new TranslationJobRunner(db, provider, {
    maxConcurrency: 3,
    maxRetries: 3,
  });

  // ========================================
  // 1. View Translation Status Overview
  // ========================================

  console.log('\n=== Translation Status Overview ===\n');

  const overallStats = dashboard.getOverallStats('en', 'fr');
  console.log('Overall Statistics:');
  console.log(`  Total resources: ${overallStats.total}`);
  console.log(`  Translated: ${overallStats.translated} (${overallStats.progress}%)`);
  console.log(`  Untranslated: ${overallStats.untranslated}`);
  console.log(`  Outdated: ${overallStats.outdated}`);
  console.log(`  Pending: ${overallStats.pending}`);
  console.log(`  Failed: ${overallStats.failed}`);

  // ========================================
  // 2. View Statistics by Resource Type
  // ========================================

  console.log('\n=== Statistics by Resource Type ===\n');

  const statsByType = dashboard.getStatsByType('en', 'fr');
  statsByType.forEach((typeStats) => {
    console.log(`${typeStats.resourceType}:`);
    console.log(`  Total: ${typeStats.stats.total}`);
    console.log(`  Translated: ${typeStats.stats.translated} (${typeStats.stats.progress}%)`);
    console.log(`  Untranslated: ${typeStats.stats.untranslated}`);
    console.log(`  Outdated: ${typeStats.stats.outdated}`);
  });

  // ========================================
  // 3. List Untranslated Content
  // ========================================

  console.log('\n=== Untranslated Content ===\n');

  const untranslated = dashboard.findUntranslated('en', 'fr', {
    limit: 10,
    offset: 0,
  });

  untranslated.forEach((item) => {
    console.log(`[${item.resourceType}] ${item.title}`);
    console.log(`  ID: ${item.resourceId}`);
    console.log(`  Missing locales: ${item.missingLocales.join(', ')}`);
  });

  // ========================================
  // 4. List Outdated Content
  // ========================================

  console.log('\n=== Outdated Content (Needs Re-translation) ===\n');

  const outdated = dashboard.findOutdated('en', 'fr', {
    limit: 10,
    offset: 0,
  });

  outdated.forEach((item) => {
    console.log(`[${item.resourceType}] ${item.title}`);
    console.log(`  ID: ${item.resourceId}`);
    console.log(`  Current hash: ${item.currentHash.substring(0, 8)}...`);
    console.log(`  Translated hash: ${item.translatedHash.substring(0, 8)}...`);
  });

  // ========================================
  // 5. Filter by Resource Type
  // ========================================

  console.log('\n=== Untranslated Products Only ===\n');

  const untranslatedProducts = dashboard.findUntranslated('en', 'fr', {
    resourceType: 'product',
    limit: 5,
  });

  console.log(`Found ${untranslatedProducts.length} untranslated products`);

  // ========================================
  // 6. Quick Actions: Translate Selected Resources
  // ========================================

  console.log('\n=== Quick Action: Translate Selected Resources ===\n');

  if (untranslated.length > 0) {
    // Select first 3 untranslated resources
    const selectedIds = untranslated.slice(0, 3).map((r) => r.resourceId);

    const job = jobCreator.createSingleResourceJobs(selectedIds, ['fr'], {
      priority: 5, // High priority for user-initiated actions
    });

    console.log(`Created translation job: ${job.id}`);
    console.log(`  Type: ${job.type}`);
    console.log(`  Target locales: ${job.target_locales.join(', ')}`);
    console.log(`  Total items: ${job.total_items}`);

    // Start processing the job
    jobRunner.start();

    // Monitor progress
    jobRunner.on('progress', (progress) => {
      if (progress.jobId === job.id) {
        console.log(`  Progress: ${progress.completed}/${progress.total} (${progress.progress}%)`);
      }
    });

    jobRunner.on('complete', (jobId) => {
      if (jobId === job.id) {
        console.log(`✓ Job ${jobId} completed`);
      }
    });
  }

  // ========================================
  // 7. Quick Actions: Translate All Untranslated
  // ========================================

  console.log('\n=== Quick Action: Translate All Untranslated ===\n');

  const translateAllJob = jobCreator.createIncrementalJob(['fr', 'de', 'es'], {
    priority: 3,
  });

  console.log(`Created incremental translation job: ${translateAllJob.id}`);
  console.log(`  Target locales: ${translateAllJob.target_locales.join(', ')}`);
  console.log(`  This will translate all untranslated and outdated content`);

  // ========================================
  // 8. Quick Actions: Re-translate Outdated Content
  // ========================================

  console.log('\n=== Quick Action: Re-translate Outdated Content ===\n');

  if (outdated.length > 0) {
    const outdatedIds = outdated.map((r) => r.resourceId);

    const retranslateJob = jobCreator.createSingleResourceJobs(outdatedIds, ['fr'], {
      priority: 4,
    });

    console.log(`Created re-translation job: ${retranslateJob.id}`);
    console.log(`  Resources to re-translate: ${outdatedIds.length}`);
  }

  // ========================================
  // 9. Get Complete Dashboard Data
  // ========================================

  console.log('\n=== Complete Dashboard Data (API-ready) ===\n');

  const dashboardData = dashboard.getDashboardData('en', 'fr', {
    limit: 5, // Limit results for preview
  });

  console.log(JSON.stringify(dashboardData, null, 2));

  // ========================================
  // 10. Check Content Status for Individual Resource
  // ========================================

  console.log('\n=== Content Status Check ===\n');

  if (untranslated.length > 0) {
    const resourceId = untranslated[0].resourceId;
    const status = dashboard.getContentStatus(resourceId, 'fr');

    console.log(`Resource ${resourceId} status for 'fr': ${status}`);
    console.log(`  Possible statuses: synced, outdated, pending, error`);
  }

  // Clean up
  await new Promise((resolve) => {
    jobRunner.on('complete', () => {
      jobRunner.stop();
      schema.close();
      console.log('\n✓ Dashboard example completed');
      resolve(undefined);
    });

    // If no jobs running, clean up immediately
    setTimeout(() => {
      jobRunner.stop();
      schema.close();
      console.log('\n✓ Dashboard example completed (no jobs)');
      resolve(undefined);
    }, 100);
  });
}

// Run the example
dashboardExample().catch(console.error);

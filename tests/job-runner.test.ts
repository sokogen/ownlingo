// Tests for Translation Job Runner
// ol-005: Translation Job Runner

import { Schema } from '../src/db/schema';
import { MockAIProvider } from '../src/providers/ai-provider';
import { TranslationJobRunner } from '../src/jobs/job-runner';
import { JobCreator } from '../src/jobs/job-creator';
import { ContentHasher } from '../src/utils/content-hash';

describe('TranslationJobRunner', () => {
  let schema: Schema;
  let provider: MockAIProvider;
  let runner: TranslationJobRunner;
  let creator: JobCreator;

  beforeEach(() => {
    schema = new Schema(':memory:');
    provider = new MockAIProvider();
    runner = new TranslationJobRunner(schema.getDatabase(), provider, {
      maxConcurrency: 2,
      pollInterval: 100,
    });
    creator = new JobCreator(schema.getDatabase());

    // Insert test resources
    const db = schema.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const content1 = 'Hello world';
    const content2 = 'Goodbye world';

    stmt.run('res1', 'shop_1', 'product', 'Product 1', content1, ContentHasher.hash({ text: content1 }), 'en', now, now);
    stmt.run('res2', 'shop_2', 'product', 'Product 2', content2, ContentHasher.hash({ text: content2 }), 'en', now, now);
  });

  afterEach(async () => {
    await runner.stop();
    schema.close();
  });

  describe('Job Creation', () => {
    test('should create full translation job', () => {
      const jobId = creator.createJob({
        type: 'full',
        sourceLocale: 'en',
        targetLocales: ['fr', 'es'],
        priority: 1,
      });

      expect(jobId).toBeTruthy();

      const db = schema.getDatabase();
      const job = db.prepare('SELECT * FROM translation_jobs WHERE id = ?').get(jobId);
      expect(job).toBeTruthy();
      expect((job as any).type).toBe('full');
      expect((job as any).status).toBe('pending');

      // Should create items for all resources * target locales
      const items = db.prepare('SELECT * FROM translation_job_items WHERE job_id = ?').all(jobId);
      expect(items.length).toBe(4); // 2 resources * 2 locales
    });

    test('should create single translation job', () => {
      const jobId = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
        priority: 2,
      });

      const db = schema.getDatabase();
      const items = db.prepare('SELECT * FROM translation_job_items WHERE job_id = ?').all(jobId);
      expect(items.length).toBe(1); // 1 resource * 1 locale
      expect((items[0] as any).resource_id).toBe('res1');
    });

    test('should create incremental translation job', () => {
      // Initially no translations exist, so all resources should be included
      const jobId = creator.createJob({
        type: 'incremental',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        priority: 1,
      });

      const db = schema.getDatabase();
      const items = db.prepare('SELECT * FROM translation_job_items WHERE job_id = ?').all(jobId);
      expect(items.length).toBe(2); // 2 resources need translation
    });
  });

  describe('Job Execution', () => {
    test('should execute job and update progress', async () => {
      const jobId = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      let progressEvents = 0;
      runner.on('progress', () => progressEvents++);

      let completedEvents = 0;
      runner.on('job:completed', () => completedEvents++);

      await runner.start();

      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const db = schema.getDatabase();
      const job = db.prepare('SELECT * FROM translation_jobs WHERE id = ?').get(jobId);
      expect((job as any).status).toBe('completed');
      expect((job as any).progress).toBe(100);
      expect(progressEvents).toBeGreaterThan(0);
      expect(completedEvents).toBe(1);
    });

    test('should respect concurrency limits', async () => {
      // Create multiple jobs
      const jobId1 = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      const jobId2 = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['es'],
        resourceId: 'res2',
      });

      await runner.start();

      // Check that concurrency is respected
      await new Promise(resolve => setTimeout(resolve, 200));

      const activeCount = (runner as any).activeJobs.size;
      expect(activeCount).toBeLessThanOrEqual(2); // maxConcurrency = 2
    });
  });

  describe('Job Cancellation', () => {
    test('should cancel pending job', async () => {
      const jobId = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      let cancelledEvents = 0;
      runner.on('job:cancelled', () => cancelledEvents++);

      await runner.cancelJob(jobId);

      const db = schema.getDatabase();
      const job = db.prepare('SELECT * FROM translation_jobs WHERE id = ?').get(jobId);
      expect((job as any).status).toBe('cancelled');
      expect(cancelledEvents).toBe(1);
    });
  });

  describe('Failed Item Retry', () => {
    test('should retry failed items', async () => {
      const jobId = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      // Manually mark item as failed
      const db = schema.getDatabase();
      db.prepare(`
        UPDATE translation_job_items
        SET status = 'failed', error_message = 'Test error'
        WHERE job_id = ?
      `).run(jobId);

      await runner.retryFailedItems(jobId);

      const items = db.prepare('SELECT * FROM translation_job_items WHERE job_id = ?').all(jobId);
      expect((items[0] as any).status).toBe('pending');
      expect((items[0] as any).retry_count).toBe(0);
    });
  });

  describe('Progress Tracking', () => {
    test('should track job progress', async () => {
      const jobId = creator.createJob({
        type: 'full',
        sourceLocale: 'en',
        targetLocales: ['fr'],
      });

      await runner.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const progress = runner.getJobProgress(jobId);
      expect(progress).toBeTruthy();
      expect(progress!.progress).toBe(100);
      expect(progress!.completed).toBe(2);
      expect(progress!.failed).toBe(0);
    });
  });

  describe('Translation Caching', () => {
    test('should cache translations and reuse them', async () => {
      // First job
      const jobId1 = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      let cacheHits = 0;
      runner.on('item:cache-hit', () => cacheHits++);

      await runner.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(cacheHits).toBe(0); // First time, no cache

      // Second job with same resource
      const jobId2 = creator.createJob({
        type: 'single',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        resourceId: 'res1',
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(cacheHits).toBe(1); // Should use cache
    });
  });
});

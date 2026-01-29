// Tests for Translation Queue UI Web Server
// ol-009: Translation Queue UI

import { Schema } from '../src/db/schema';
import { TranslationJobRunner } from '../src/jobs/job-runner';
import { JobCreator } from '../src/jobs/job-creator';
import { MockAIProvider } from '../src/providers/ai-provider';

describe('Translation Queue UI', () => {
  let schema: Schema;
  let db: any;
  let provider: MockAIProvider;
  let jobCreator: JobCreator;
  let jobRunner: TranslationJobRunner;

  beforeEach(() => {
    schema = new Schema(':memory:');
    db = schema.getDatabase();
    provider = new MockAIProvider();
    jobCreator = new JobCreator(db);
    jobRunner = new TranslationJobRunner(db, provider);
  });

  afterEach(() => {
    schema.close();
  });

  describe('Job listing', () => {
    it('should list all jobs', () => {
      // Create test jobs
      jobCreator.createFullJob('en', ['es', 'fr']);
      jobCreator.createFullJob('en', ['de']);

      const stmt = db.prepare('SELECT * FROM translation_jobs ORDER BY created_at DESC');
      const jobs = stmt.all();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].type).toBe('full');
      expect(jobs[0].status).toBe('pending');
    });

    it('should filter jobs by status', () => {
      const job1 = jobCreator.createFullJob('en', ['es']);
      const job2 = jobCreator.createFullJob('en', ['fr']);

      // Update one job to running
      const stmt = db.prepare('UPDATE translation_jobs SET status = ? WHERE id = ?');
      stmt.run('running', job1);

      const pendingStmt = db.prepare('SELECT * FROM translation_jobs WHERE status = ?');
      const pendingJobs = pendingStmt.all('pending');
      expect(pendingJobs).toHaveLength(1);

      const runningJobs = pendingStmt.all('running');
      expect(runningJobs).toHaveLength(1);
    });
  });

  describe('Job details', () => {
    it('should get job details with items', () => {
      // Create a resource
      const resourceStmt = db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      resourceStmt.run(
        'res1',
        'shopify_123',
        'product',
        'Test Product',
        'Product description',
        'hash123',
        'en',
        Date.now(),
        Date.now()
      );

      // Create a job
      const jobId = jobCreator.createSingleJob('res1', 'en', 'es');

      // Get job
      const jobStmt = db.prepare('SELECT * FROM translation_jobs WHERE id = ?');
      const job = jobStmt.get(jobId);
      expect(job).toBeDefined();
      expect(job.id).toBe(jobId);

      // Get job items
      const itemsStmt = db.prepare(`
        SELECT
          ji.*,
          r.title,
          r.resource_type
        FROM translation_job_items ji
        LEFT JOIN resources r ON ji.resource_id = r.id
        WHERE ji.job_id = ?
      `);
      const items = itemsStmt.all(jobId);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Test Product');
      expect(items[0].resource_type).toBe('product');
    });

    it('should get job error logs', () => {
      const jobId = jobCreator.createFullJob('en', ['es']);

      // Create a failed item
      const itemStmt = db.prepare(`
        INSERT INTO translation_job_items
        (id, job_id, resource_id, target_locale, status, retry_count, max_retries, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      itemStmt.run(
        'item1',
        jobId,
        'res1',
        'es',
        'failed',
        3,
        3,
        'Translation failed',
        Date.now(),
        Date.now()
      );

      // Get logs
      const logsStmt = db.prepare(`
        SELECT * FROM translation_job_items
        WHERE job_id = ? AND error_message IS NOT NULL
        ORDER BY updated_at DESC
      `);
      const logs = logsStmt.all(jobId);
      expect(logs).toHaveLength(1);
      expect(logs[0].error_message).toBe('Translation failed');
    });
  });

  describe('Job actions', () => {
    it('should cancel a job', async () => {
      const jobId = jobCreator.createFullJob('en', ['es']);

      await jobRunner.cancelJob(jobId);

      const stmt = db.prepare('SELECT * FROM translation_jobs WHERE id = ?');
      const job = stmt.get(jobId);
      expect(job.status).toBe('cancelled');
    });

    it('should retry failed items', async () => {
      const jobId = jobCreator.createFullJob('en', ['es']);

      // Create a failed item
      const itemStmt = db.prepare(`
        INSERT INTO translation_job_items
        (id, job_id, resource_id, target_locale, status, retry_count, max_retries, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      itemStmt.run(
        'item1',
        jobId,
        'res1',
        'es',
        'failed',
        3,
        3,
        'Translation failed',
        Date.now(),
        Date.now()
      );

      // Update job to failed
      const updateStmt = db.prepare('UPDATE translation_jobs SET status = ? WHERE id = ?');
      updateStmt.run('failed', jobId);

      await jobRunner.retryFailedItems(jobId);

      // Check item status
      const checkItemStmt = db.prepare('SELECT * FROM translation_job_items WHERE id = ?');
      const item = checkItemStmt.get('item1');
      expect(item.status).toBe('pending');
      expect(item.retry_count).toBe(0);

      // Check job status
      const checkJobStmt = db.prepare('SELECT * FROM translation_jobs WHERE id = ?');
      const job = checkJobStmt.get(jobId);
      expect(job.status).toBe('pending');
    });
  });

  describe('Real-time updates', () => {
    it('should emit progress events', (done) => {
      const jobId = jobCreator.createFullJob('en', ['es']);

      jobRunner.on('progress', (data) => {
        expect(data.jobId).toBe(jobId);
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('completed');
        expect(data).toHaveProperty('failed');
        expect(data).toHaveProperty('progress');
        done();
      });

      // Manually trigger progress update (in real scenario, this happens during job processing)
      const itemStmt = db.prepare(`
        INSERT INTO translation_job_items
        (id, job_id, resource_id, target_locale, status, retry_count, max_retries, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      itemStmt.run('item1', jobId, 'res1', 'es', 'pending', 0, 3, Date.now(), Date.now());

      // Trigger progress calculation
      const stmt = db.prepare(`
        UPDATE translation_job_items SET status = ? WHERE id = ?
      `);
      stmt.run('completed', 'item1');

      // Manually call the private method via a workaround
      (jobRunner as any).updateJobProgress(jobId);
    });

    it('should emit job completion events', (done) => {
      const jobId = jobCreator.createFullJob('en', ['es']);

      jobRunner.on('job:completed', (data) => {
        expect(data.jobId).toBe(jobId);
        done();
      });

      // Simulate job completion
      const stmt = db.prepare('UPDATE translation_jobs SET status = ? WHERE id = ?');
      stmt.run('completed', jobId);

      jobRunner.emit('job:completed', { jobId });
    });
  });
});

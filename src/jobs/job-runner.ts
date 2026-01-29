// Translation Job Runner - Background job system
// ol-005: Translation Job Runner

import { Database } from 'better-sqlite3';
import { AIProvider } from '../providers/ai-provider';
import { ContentHasher } from '../utils/content-hash';
import { EventEmitter } from 'events';

export interface JobConfig {
  maxConcurrency: number;
  maxRetries: number;
  retryDelay: number; // milliseconds
  pollInterval: number; // milliseconds
}

export interface JobProgress {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  progress: number; // percentage
}

export class TranslationJobRunner extends EventEmitter {
  private db: Database;
  private provider: AIProvider;
  private config: JobConfig;
  private running: boolean = false;
  private activeJobs: Set<string> = new Set();
  private cancelledJobs: Set<string> = new Set();
  private currentConcurrency: number = 0;
  private rateLimitQueue: Array<() => void> = [];
  private lastRequestTime: number = 0;

  constructor(db: Database, provider: AIProvider, config?: Partial<JobConfig>) {
    super();
    this.db = db;
    this.provider = provider;
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 5,
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      pollInterval: config?.pollInterval ?? 5000,
    };
  }

  /**
   * Start the job runner
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Job runner is already running');
    }

    this.running = true;
    this.emit('started');
    this.processQueue();
  }

  /**
   * Stop the job runner
   */
  async stop(): Promise<void> {
    this.running = false;

    // Wait for active jobs to complete
    while (this.activeJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('stopped');
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    while (this.running) {
      try {
        // Get next pending job with highest priority
        const job = this.getNextJob();

        if (job && this.currentConcurrency < this.config.maxConcurrency) {
          this.processJob(job.id);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  /**
   * Get next pending job from queue
   */
  private getNextJob(): any {
    const stmt = this.db.prepare(`
      SELECT * FROM translation_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);
    return stmt.get();
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: string): Promise<void> {
    if (this.cancelledJobs.has(jobId)) {
      this.updateJobStatus(jobId, 'cancelled');
      this.cancelledJobs.delete(jobId);
      return;
    }

    this.activeJobs.add(jobId);
    this.updateJobStatus(jobId, 'running', { started_at: Date.now() });

    try {
      // Get job items
      const items = this.getJobItems(jobId);

      // Process items
      for (const item of items) {
        if (this.cancelledJobs.has(jobId)) {
          break;
        }

        await this.processJobItem(jobId, item);
      }

      // Update job completion status
      this.finalizeJob(jobId);
    } catch (error: any) {
      this.updateJobStatus(jobId, 'failed', {
        error_message: error.message,
        completed_at: Date.now(),
      });
      this.emit('job:failed', { jobId, error: error.message });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Get all items for a job
   */
  private getJobItems(jobId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM translation_job_items
      WHERE job_id = ? AND status IN ('pending', 'failed')
      ORDER BY created_at ASC
    `);
    return stmt.all(jobId);
  }

  /**
   * Process a single job item
   */
  private async processJobItem(jobId: string, item: any): Promise<void> {
    this.updateItemStatus(item.id, 'processing');

    try {
      // Get resource
      const resource = this.getResource(item.resource_id);
      if (!resource) {
        throw new Error(`Resource not found: ${item.resource_id}`);
      }

      // Check cache
      const cached = this.getCachedTranslation(
        resource.content_hash,
        item.target_locale
      );

      let translatedContent: string;

      if (cached) {
        translatedContent = cached.translated_content;
        this.emit('item:cache-hit', { jobId, itemId: item.id });
      } else {
        // Translate with rate limiting
        await this.waitForRateLimit();

        const response = await this.provider.translate({
          text: resource.content,
          sourceLocale: resource.locale,
          targetLocale: item.target_locale,
          context: resource.title,
        });

        translatedContent = response.translatedText;

        // Cache the translation
        this.cacheTranslation({
          resource_id: resource.id,
          source_locale: resource.locale,
          target_locale: item.target_locale,
          source_hash: resource.content_hash,
          translated_content: translatedContent,
          provider: response.provider,
        });
      }

      // Update item
      this.updateItemStatus(item.id, 'completed', {
        translated_content: translatedContent,
      });

      this.updateJobProgress(jobId);
      this.emit('item:completed', { jobId, itemId: item.id });

    } catch (error: any) {
      const retryCount = item.retry_count + 1;

      if (retryCount < item.max_retries) {
        // Retry
        this.updateItemRetry(item.id, retryCount, error.message);
        this.emit('item:retry', { jobId, itemId: item.id, retryCount });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));

        // Retry the item
        await this.processJobItem(jobId, { ...item, retry_count: retryCount });
      } else {
        // Mark as failed
        this.updateItemStatus(item.id, 'failed', {
          error_message: error.message,
        });
        this.updateJobProgress(jobId);
        this.emit('item:failed', { jobId, itemId: item.id, error: error.message });
      }
    }
  }

  /**
   * Wait for rate limit before making API call
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.provider.rateLimit.requestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get resource from database
   */
  private getResource(resourceId: string): any {
    const stmt = this.db.prepare('SELECT * FROM resources WHERE id = ?');
    return stmt.get(resourceId);
  }

  /**
   * Get cached translation
   */
  private getCachedTranslation(sourceHash: string, targetLocale: string): any {
    const stmt = this.db.prepare(`
      SELECT * FROM translations
      WHERE source_hash = ? AND target_locale = ?
      LIMIT 1
    `);
    return stmt.get(sourceHash, targetLocale);
  }

  /**
   * Cache a translation
   */
  private cacheTranslation(translation: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      translation.resource_id,
      translation.source_locale,
      translation.target_locale,
      translation.source_hash,
      translation.translated_content,
      translation.provider,
      Date.now()
    );
  }

  /**
   * Update job status
   */
  private updateJobStatus(jobId: string, status: string, updates: any = {}): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    let sql = `UPDATE translation_jobs SET status = ?, updated_at = ?`;
    const params: any[] = [status, Date.now()];

    if (fields) {
      sql += `, ${fields}`;
      params.push(...values);
    }

    sql += ` WHERE id = ?`;
    params.push(jobId);

    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  /**
   * Update item status
   */
  private updateItemStatus(itemId: string, status: string, updates: any = {}): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    let sql = `UPDATE translation_job_items SET status = ?, updated_at = ?`;
    const params: any[] = [status, Date.now()];

    if (fields) {
      sql += `, ${fields}`;
      params.push(...values);
    }

    sql += ` WHERE id = ?`;
    params.push(itemId);

    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  /**
   * Update item retry count
   */
  private updateItemRetry(itemId: string, retryCount: number, errorMessage: string): void {
    const stmt = this.db.prepare(`
      UPDATE translation_job_items
      SET retry_count = ?, error_message = ?, status = 'pending', updated_at = ?
      WHERE id = ?
    `);
    stmt.run(retryCount, errorMessage, Date.now(), itemId);
  }

  /**
   * Update job progress
   */
  private updateJobProgress(jobId: string): void {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM translation_job_items
      WHERE job_id = ?
    `);

    const stats: any = stmt.get(jobId);
    const progress = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

    const updateStmt = this.db.prepare(`
      UPDATE translation_jobs
      SET total_items = ?, completed_items = ?, failed_items = ?, progress = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      stats.total,
      stats.completed,
      stats.failed,
      progress,
      Date.now(),
      jobId
    );

    this.emit('progress', {
      jobId,
      total: stats.total,
      completed: stats.completed,
      failed: stats.failed,
      progress,
    });
  }

  /**
   * Finalize job after all items are processed
   */
  private finalizeJob(jobId: string): void {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as failed
      FROM translation_job_items
      WHERE job_id = ? AND status = 'failed'
    `);

    const result: any = stmt.get(jobId);
    const status = result.failed > 0 ? 'completed' : 'completed';

    this.updateJobStatus(jobId, status, { completed_at: Date.now() });
    this.emit('job:completed', { jobId });
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    this.cancelledJobs.add(jobId);

    // If job is not active, mark it as cancelled immediately
    if (!this.activeJobs.has(jobId)) {
      this.updateJobStatus(jobId, 'cancelled');
      this.cancelledJobs.delete(jobId);
    }

    this.emit('job:cancelled', { jobId });
  }

  /**
   * Get job progress
   */
  getJobProgress(jobId: string): JobProgress | null {
    const stmt = this.db.prepare(`
      SELECT id, total_items, completed_items, failed_items, progress
      FROM translation_jobs
      WHERE id = ?
    `);

    const job: any = stmt.get(jobId);
    if (!job) return null;

    return {
      jobId: job.id,
      total: job.total_items,
      completed: job.completed_items,
      failed: job.failed_items,
      progress: job.progress,
    };
  }

  /**
   * Retry failed items in a job
   */
  async retryFailedItems(jobId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE translation_job_items
      SET status = 'pending', retry_count = 0, error_message = NULL, updated_at = ?
      WHERE job_id = ? AND status = 'failed'
    `);

    stmt.run(Date.now(), jobId);

    // Reset job status if it was failed
    const jobStmt = this.db.prepare(`
      UPDATE translation_jobs
      SET status = 'pending', updated_at = ?
      WHERE id = ? AND status IN ('failed', 'completed')
    `);

    jobStmt.run(Date.now(), jobId);

    this.emit('job:retry', { jobId });
  }
}

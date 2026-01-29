// Job Creator - Create different types of translation jobs
// ol-005: Translation Job Runner

import { Database } from 'better-sqlite3';
import { ContentHasher } from '../utils/content-hash';

export interface CreateJobOptions {
  type: 'full' | 'incremental' | 'single';
  sourceLocale: string;
  targetLocales: string[];
  priority?: number;
  resourceId?: string; // For 'single' type jobs
}

export class JobCreator {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new translation job
   */
  createJob(options: CreateJobOptions): string {
    const jobId = this.generateJobId();
    const now = Date.now();

    // Insert job record
    const jobStmt = this.db.prepare(`
      INSERT INTO translation_jobs (
        id, type, status, priority, source_locale, target_locales,
        total_items, completed_items, failed_items, progress,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    jobStmt.run(
      jobId,
      options.type,
      'pending',
      options.priority ?? 0,
      options.sourceLocale,
      JSON.stringify(options.targetLocales),
      0,
      0,
      0,
      0,
      now,
      now
    );

    // Create job items based on type
    switch (options.type) {
      case 'full':
        this.createFullJobItems(jobId, options);
        break;
      case 'incremental':
        this.createIncrementalJobItems(jobId, options);
        break;
      case 'single':
        if (!options.resourceId) {
          throw new Error('resourceId is required for single job type');
        }
        this.createSingleJobItems(jobId, options);
        break;
    }

    return jobId;
  }

  /**
   * Create items for full translation job (all content)
   */
  private createFullJobItems(jobId: string, options: CreateJobOptions): void {
    // Get all resources in source locale
    const resourceStmt = this.db.prepare(`
      SELECT id FROM resources
      WHERE locale = ?
    `);

    const resources = resourceStmt.all(options.sourceLocale);

    this.createItemsForResources(
      jobId,
      resources.map((r: any) => r.id),
      options.targetLocales
    );
  }

  /**
   * Create items for incremental translation job (changed content only)
   */
  private createIncrementalJobItems(jobId: string, options: CreateJobOptions): void {
    // Get resources that have changed (no translation or hash mismatch)
    const resourceStmt = this.db.prepare(`
      SELECT DISTINCT r.id
      FROM resources r
      WHERE r.locale = ?
        AND NOT EXISTS (
          SELECT 1 FROM translations t
          WHERE t.resource_id = r.id
            AND t.source_hash = r.content_hash
            AND t.target_locale IN (${options.targetLocales.map(() => '?').join(',')})
        )
    `);

    const resources = resourceStmt.all(options.sourceLocale, ...options.targetLocales);

    this.createItemsForResources(
      jobId,
      resources.map((r: any) => r.id),
      options.targetLocales
    );
  }

  /**
   * Create items for single resource translation job
   */
  private createSingleJobItems(jobId: string, options: CreateJobOptions): void {
    if (!options.resourceId) {
      throw new Error('resourceId is required for single job type');
    }

    this.createItemsForResources(jobId, [options.resourceId], options.targetLocales);
  }

  /**
   * Create job items for given resources and target locales
   */
  private createItemsForResources(
    jobId: string,
    resourceIds: string[],
    targetLocales: string[]
  ): void {
    const now = Date.now();
    const itemStmt = this.db.prepare(`
      INSERT INTO translation_job_items (
        id, job_id, resource_id, target_locale, status,
        retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const resourceId of resourceIds) {
      for (const targetLocale of targetLocales) {
        const itemId = this.generateItemId();
        itemStmt.run(
          itemId,
          jobId,
          resourceId,
          targetLocale,
          'pending',
          0,
          3, // max retries
          now,
          now
        );
      }
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique item ID
   */
  private generateItemId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

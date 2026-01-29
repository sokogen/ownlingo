// Dashboard service for translation status overview and content management
// ol-008: Dashboard UI

import Database from 'better-sqlite3';
import {
  DashboardData,
  TranslationStats,
  StatsByType,
  UntranslatedResource,
  OutdatedResource,
  FilterOptions,
  ContentStatus,
} from './types';

export class DashboardService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get overall translation statistics across all content
   */
  getOverallStats(sourceLocale: string, targetLocale: string): TranslationStats {
    // Count total resources in source locale
    const totalResult = this.db
      .prepare('SELECT COUNT(*) as count FROM resources WHERE locale = ?')
      .get(sourceLocale) as { count: number };
    const total = totalResult.count;

    // Count translated resources (have translation with matching hash)
    const translatedResult = this.db
      .prepare(`
        SELECT COUNT(DISTINCT r.id) as count
        FROM resources r
        INNER JOIN translations t ON r.id = t.resource_id
          AND t.target_locale = ?
          AND t.source_hash = r.content_hash
        WHERE r.locale = ?
      `)
      .get(targetLocale, sourceLocale) as { count: number };
    const translated = translatedResult.count;

    // Count outdated resources (have translation but hash mismatch)
    const outdatedResult = this.db
      .prepare(`
        SELECT COUNT(DISTINCT r.id) as count
        FROM resources r
        INNER JOIN translations t ON r.id = t.resource_id
          AND t.target_locale = ?
          AND t.source_hash != r.content_hash
        WHERE r.locale = ?
      `)
      .get(targetLocale, sourceLocale) as { count: number };
    const outdated = outdatedResult.count;

    // Count pending items in jobs
    const pendingResult = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM translation_job_items
        WHERE target_locale = ? AND status IN ('pending', 'processing')
      `)
      .get(targetLocale) as { count: number };
    const pending = pendingResult.count;

    // Count failed items in jobs
    const failedResult = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM translation_job_items
        WHERE target_locale = ? AND status = 'failed'
      `)
      .get(targetLocale) as { count: number };
    const failed = failedResult.count;

    const untranslated = total - translated - outdated;
    const progress = total > 0 ? Math.round((translated / total) * 100) : 0;

    return {
      total,
      translated,
      untranslated: Math.max(0, untranslated),
      outdated,
      pending,
      failed,
      progress,
    };
  }

  /**
   * Get translation statistics grouped by resource type
   */
  getStatsByType(sourceLocale: string, targetLocale: string): StatsByType[] {
    // Get all resource types
    const typesResult = this.db
      .prepare('SELECT DISTINCT resource_type FROM resources WHERE locale = ?')
      .all(sourceLocale) as Array<{ resource_type: string }>;

    return typesResult.map((row) => {
      const resourceType = row.resource_type;

      // Total for this type
      const totalResult = this.db
        .prepare('SELECT COUNT(*) as count FROM resources WHERE locale = ? AND resource_type = ?')
        .get(sourceLocale, resourceType) as { count: number };
      const total = totalResult.count;

      // Translated for this type
      const translatedResult = this.db
        .prepare(`
          SELECT COUNT(DISTINCT r.id) as count
          FROM resources r
          INNER JOIN translations t ON r.id = t.resource_id
            AND t.target_locale = ?
            AND t.source_hash = r.content_hash
          WHERE r.locale = ? AND r.resource_type = ?
        `)
        .get(targetLocale, sourceLocale, resourceType) as { count: number };
      const translated = translatedResult.count;

      // Outdated for this type
      const outdatedResult = this.db
        .prepare(`
          SELECT COUNT(DISTINCT r.id) as count
          FROM resources r
          INNER JOIN translations t ON r.id = t.resource_id
            AND t.target_locale = ?
            AND t.source_hash != r.content_hash
          WHERE r.locale = ? AND r.resource_type = ?
        `)
        .get(targetLocale, sourceLocale, resourceType) as { count: number };
      const outdated = outdatedResult.count;

      // Pending for this type
      const pendingResult = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM translation_job_items ji
          INNER JOIN resources r ON ji.resource_id = r.id
          WHERE ji.target_locale = ? AND ji.status IN ('pending', 'processing')
            AND r.resource_type = ?
        `)
        .get(targetLocale, resourceType) as { count: number };
      const pending = pendingResult.count;

      // Failed for this type
      const failedResult = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM translation_job_items ji
          INNER JOIN resources r ON ji.resource_id = r.id
          WHERE ji.target_locale = ? AND ji.status = 'failed'
            AND r.resource_type = ?
        `)
        .get(targetLocale, resourceType) as { count: number };
      const failed = failedResult.count;

      const untranslated = total - translated - outdated;
      const progress = total > 0 ? Math.round((translated / total) * 100) : 0;

      return {
        resourceType,
        stats: {
          total,
          translated,
          untranslated: Math.max(0, untranslated),
          outdated,
          pending,
          failed,
          progress,
        },
      };
    });
  }

  /**
   * Find all untranslated resources (no translation exists for target locale)
   */
  findUntranslated(
    sourceLocale: string,
    targetLocale: string,
    options: FilterOptions = {}
  ): UntranslatedResource[] {
    const { resourceType, limit = 100, offset = 0 } = options;

    let query = `
      SELECT r.id, r.shopify_id, r.resource_type, r.title, r.content_hash, r.locale
      FROM resources r
      WHERE r.locale = ?
        AND NOT EXISTS (
          SELECT 1 FROM translations t
          WHERE t.resource_id = r.id AND t.target_locale = ?
        )
    `;

    const params: any[] = [sourceLocale, targetLocale];

    if (resourceType) {
      query += ' AND r.resource_type = ?';
      params.push(resourceType);
    }

    query += ' ORDER BY r.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = this.db.prepare(query).all(...params) as Array<{
      id: string;
      shopify_id: string;
      resource_type: string;
      title: string;
      content_hash: string;
      locale: string;
    }>;

    return results.map((row) => ({
      resourceId: row.id,
      resourceType: row.resource_type,
      title: row.title,
      contentHash: row.content_hash,
      locale: row.locale,
      missingLocales: [targetLocale],
    }));
  }

  /**
   * Find all outdated resources (translation exists but content has changed)
   */
  findOutdated(
    sourceLocale: string,
    targetLocale: string,
    options: FilterOptions = {}
  ): OutdatedResource[] {
    const { resourceType, limit = 100, offset = 0 } = options;

    let query = `
      SELECT
        r.id,
        r.resource_type,
        r.title,
        r.locale,
        r.content_hash as current_hash,
        t.id as translation_id,
        t.source_locale,
        t.target_locale,
        t.source_hash as translated_hash
      FROM resources r
      INNER JOIN translations t ON r.id = t.resource_id
        AND t.target_locale = ?
        AND t.source_hash != r.content_hash
      WHERE r.locale = ?
    `;

    const params: any[] = [targetLocale, sourceLocale];

    if (resourceType) {
      query += ' AND r.resource_type = ?';
      params.push(resourceType);
    }

    query += ' ORDER BY r.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = this.db.prepare(query).all(...params) as Array<{
      id: string;
      resource_type: string;
      title: string;
      locale: string;
      current_hash: string;
      translation_id: string;
      source_locale: string;
      target_locale: string;
      translated_hash: string;
    }>;

    return results.map((row) => ({
      resourceId: row.id,
      resourceType: row.resource_type,
      title: row.title,
      locale: row.locale,
      sourceLocale: row.source_locale,
      currentHash: row.current_hash,
      translatedHash: row.translated_hash,
      translationId: row.translation_id,
    }));
  }

  /**
   * Get complete dashboard data in one call
   */
  getDashboardData(
    sourceLocale: string,
    targetLocale: string,
    filterOptions: FilterOptions = {}
  ): DashboardData {
    return {
      overallStats: this.getOverallStats(sourceLocale, targetLocale),
      statsByType: this.getStatsByType(sourceLocale, targetLocale),
      untranslated: this.findUntranslated(sourceLocale, targetLocale, filterOptions),
      outdated: this.findOutdated(sourceLocale, targetLocale, filterOptions),
    };
  }

  /**
   * Get content status for dashboard filtering
   */
  getContentStatus(resourceId: string, targetLocale: string): ContentStatus {
    // Check if translation exists
    const translation = this.db
      .prepare(`
        SELECT t.*, r.content_hash
        FROM translations t
        INNER JOIN resources r ON t.resource_id = r.id
        WHERE t.resource_id = ? AND t.target_locale = ?
      `)
      .get(resourceId, targetLocale) as
      | { source_hash: string; content_hash: string; id: string }
      | undefined;

    if (!translation) {
      return 'pending';
    }

    // Check for failed job items
    const failedItem = this.db
      .prepare(`
        SELECT 1
        FROM translation_job_items
        WHERE resource_id = ? AND target_locale = ? AND status = 'failed'
        LIMIT 1
      `)
      .get(resourceId, targetLocale);

    if (failedItem) {
      return 'error';
    }

    // Check if hash matches (synced vs outdated)
    if (translation.source_hash !== translation.content_hash) {
      return 'outdated';
    }

    return 'synced';
  }
}

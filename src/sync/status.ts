import { PrismaClient, TranslationStatus } from '@prisma/client';

export type SyncStatus = 'synced' | 'outdated' | 'pending' | 'error';

export interface ContentSyncStatus {
  contentHashId: string;
  resourceType: string;
  resourceId: string;
  fieldName: string;
  locale: string;
  syncStatus: SyncStatus;
  translationId?: string;
  translationStatus?: TranslationStatus;
  errorMessage?: string;
}

export interface SyncStatusAggregation {
  synced: number;
  outdated: number;
  pending: number;
  error: number;
  total: number;
}

export interface SyncStatusByType {
  resourceType: string;
  aggregation: SyncStatusAggregation;
}

export class SyncStatusService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Compute sync status for a contentHash + locale combination
   *
   * Logic:
   * - 'pending': No translation exists for this locale
   * - 'error': Translation exists but status is FAILED
   * - 'outdated': Translation exists but sourceContentHash != current contentHash
   * - 'synced': Translation exists, COMPLETED status, and hashes match
   */
  private computeSyncStatus(
    currentHash: string,
    translation?: {
      id: string;
      sourceContentHash: string;
      status: TranslationStatus;
      errorMessage?: string | null;
    }
  ): {
    syncStatus: SyncStatus;
    translationId?: string;
    translationStatus?: TranslationStatus;
    errorMessage?: string;
  } {
    // No translation exists
    if (!translation) {
      return { syncStatus: 'pending' };
    }

    // Translation failed
    if (translation.status === 'FAILED') {
      return {
        syncStatus: 'error',
        translationId: translation.id,
        translationStatus: translation.status,
        errorMessage: translation.errorMessage || undefined,
      };
    }

    // Content hash changed - translation is outdated
    if (translation.sourceContentHash !== currentHash) {
      return {
        syncStatus: 'outdated',
        translationId: translation.id,
        translationStatus: translation.status,
      };
    }

    // Translation is synced
    return {
      syncStatus: 'synced',
      translationId: translation.id,
      translationStatus: translation.status,
    };
  }

  /**
   * Get sync status for all content in a shop for a specific locale
   */
  async getShopSyncStatus(
    shopId: string,
    locale: string,
    resourceType?: string
  ): Promise<ContentSyncStatus[]> {
    // Get language ID for the locale
    const language = await this.prisma.language.findUnique({
      where: {
        shopId_locale: { shopId, locale },
      },
    });

    if (!language) {
      throw new Error(`Language ${locale} not found for shop ${shopId}`);
    }

    // Build where clause
    const where: any = { shopId };
    if (resourceType) {
      where.resourceType = resourceType;
    }

    // Get all content hashes with their translations for this locale
    const contentHashes = await this.prisma.contentHash.findMany({
      where,
      include: {
        translations: {
          where: {
            languageId: language.id,
          },
        },
      },
    });

    // Compute sync status for each
    return contentHashes.map((ch) => {
      const translation = ch.translations[0]; // Should only be one per locale
      const statusInfo = this.computeSyncStatus(ch.hash, translation);

      return {
        contentHashId: ch.id,
        resourceType: ch.resourceType,
        resourceId: ch.resourceId,
        fieldName: ch.fieldName,
        locale,
        ...statusInfo,
      };
    });
  }

  /**
   * Find all content items with a specific sync status
   */
  async findByStatus(
    shopId: string,
    locale: string,
    status: SyncStatus,
    resourceType?: string
  ): Promise<ContentSyncStatus[]> {
    const allStatuses = await this.getShopSyncStatus(shopId, locale, resourceType);
    return allStatuses.filter((s) => s.syncStatus === status);
  }

  /**
   * Find all untranslated (pending) content
   */
  async findUntranslated(
    shopId: string,
    locale: string,
    resourceType?: string
  ): Promise<ContentSyncStatus[]> {
    return this.findByStatus(shopId, locale, 'pending', resourceType);
  }

  /**
   * Find all outdated content (needs retranslation)
   */
  async findOutdated(
    shopId: string,
    locale: string,
    resourceType?: string
  ): Promise<ContentSyncStatus[]> {
    return this.findByStatus(shopId, locale, 'outdated', resourceType);
  }

  /**
   * Get aggregated sync status counts for a shop + locale
   */
  async getAggregation(
    shopId: string,
    locale: string,
    resourceType?: string
  ): Promise<SyncStatusAggregation> {
    const statuses = await this.getShopSyncStatus(shopId, locale, resourceType);

    const counts = statuses.reduce(
      (acc, s) => {
        acc[s.syncStatus]++;
        acc.total++;
        return acc;
      },
      { synced: 0, outdated: 0, pending: 0, error: 0, total: 0 }
    );

    return counts;
  }

  /**
   * Get aggregated sync status by resource type (for dashboard)
   */
  async getAggregationByType(
    shopId: string,
    locale: string
  ): Promise<SyncStatusByType[]> {
    const statuses = await this.getShopSyncStatus(shopId, locale);

    // Group by resource type
    const byType = statuses.reduce((acc, s) => {
      if (!acc[s.resourceType]) {
        acc[s.resourceType] = {
          synced: 0,
          outdated: 0,
          pending: 0,
          error: 0,
          total: 0,
        };
      }

      acc[s.resourceType][s.syncStatus]++;
      acc[s.resourceType].total++;

      return acc;
    }, {} as Record<string, SyncStatusAggregation>);

    // Convert to array
    return Object.entries(byType).map(([resourceType, aggregation]) => ({
      resourceType,
      aggregation,
    }));
  }

  /**
   * Get overall progress percentage for a shop + locale
   */
  async getProgress(shopId: string, locale: string): Promise<number> {
    const agg = await this.getAggregation(shopId, locale);
    if (agg.total === 0) return 0;
    return Math.round((agg.synced / agg.total) * 100);
  }
}

import { PrismaClient, TranslationStatus } from '@prisma/client';

/**
 * Sync status types for tracking content-translation synchronization
 */
export type SyncStatus = 'synced' | 'outdated' | 'pending' | 'error';

/**
 * Result of sync status check for a translation
 */
export interface TranslationSyncStatus {
  translationId: string;
  contentHashId: string;
  languageId: string;
  locale: string;
  resourceType: string;
  resourceId: string;
  fieldName: string;
  syncStatus: SyncStatus;
  contentUpdatedAt: Date;
  translationUpdatedAt: Date;
  translationStatus: TranslationStatus;
}

/**
 * Aggregated statistics for content sync
 */
export interface SyncAggregation {
  shopId: string;
  locale?: string;
  resourceType?: string;
  total: number;
  synced: number;
  outdated: number;
  pending: number;
  error: number;
}

/**
 * Untranslated content item
 */
export interface UntranslatedContent {
  contentHashId: string;
  resourceType: string;
  resourceId: string;
  fieldName: string;
  content: string;
  createdAt: Date;
  missingLocales: string[];
}

/**
 * Repository for tracking content-translation sync status
 */
export class SyncStatusRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Determine sync status based on translation and content hash state
   */
  private determineSyncStatus(
    translation: {
      status: TranslationStatus;
      updatedAt: Date;
      errorMessage: string | null;
    },
    contentHash: {
      updatedAt: Date;
    }
  ): SyncStatus {
    // If translation has an error, it's in error state
    if (translation.errorMessage || translation.status === 'FAILED') {
      return 'error';
    }

    // If translation is pending or in progress, it's pending
    if (translation.status === 'PENDING' || translation.status === 'IN_PROGRESS') {
      return 'pending';
    }

    // If content was updated after translation, it's outdated
    if (contentHash.updatedAt > translation.updatedAt) {
      return 'outdated';
    }

    // If translation is completed and up-to-date, it's synced
    if (translation.status === 'COMPLETED') {
      return 'synced';
    }

    // Needs review is considered synced but flagged
    return 'synced';
  }

  /**
   * Get outdated translations for a shop
   * Returns translations where content has been updated after translation
   */
  async getOutdatedTranslations(
    shopId: string,
    locale?: string,
    resourceType?: string
  ): Promise<TranslationSyncStatus[]> {
    const where: any = {
      shopId,
      status: 'COMPLETED', // Only look at completed translations
    };

    if (locale) {
      where.language = { locale };
    }

    if (resourceType) {
      where.contentHash = { resourceType };
    }

    const translations = await this.prisma.translation.findMany({
      where,
      include: {
        contentHash: true,
        language: true,
      },
    });

    // Filter to only outdated ones
    const outdated = translations.filter(
      (t) => t.contentHash.updatedAt > t.updatedAt
    );

    return outdated.map((t) => ({
      translationId: t.id,
      contentHashId: t.contentHashId,
      languageId: t.languageId,
      locale: t.language.locale,
      resourceType: t.contentHash.resourceType,
      resourceId: t.contentHash.resourceId,
      fieldName: t.contentHash.fieldName,
      syncStatus: 'outdated',
      contentUpdatedAt: t.contentHash.updatedAt,
      translationUpdatedAt: t.updatedAt,
      translationStatus: t.status,
    }));
  }

  /**
   * Get untranslated content for specific locales
   * Returns content hashes that don't have translations in specified locales
   */
  async getUntranslatedContent(
    shopId: string,
    targetLocales: string[],
    resourceType?: string
  ): Promise<UntranslatedContent[]> {
    const where: any = { shopId };
    if (resourceType) {
      where.resourceType = resourceType;
    }

    // Get all content hashes
    const contentHashes = await this.prisma.contentHash.findMany({
      where,
      include: {
        translations: {
          include: {
            language: true,
          },
        },
      },
    });

    // Get all available languages for this shop
    const languages = await this.prisma.language.findMany({
      where: {
        shopId,
        locale: { in: targetLocales },
        isEnabled: true,
      },
    });

    const languageLocales = languages.map((l) => l.locale);
    const results: UntranslatedContent[] = [];

    for (const contentHash of contentHashes) {
      // Find which locales are missing translations
      const existingLocales = contentHash.translations.map(
        (t) => t.language.locale
      );
      const missingLocales = languageLocales.filter(
        (locale) => !existingLocales.includes(locale)
      );

      if (missingLocales.length > 0) {
        results.push({
          contentHashId: contentHash.id,
          resourceType: contentHash.resourceType,
          resourceId: contentHash.resourceId,
          fieldName: contentHash.fieldName,
          content: contentHash.content,
          createdAt: contentHash.createdAt,
          missingLocales,
        });
      }
    }

    return results;
  }

  /**
   * Get all translation sync statuses for a shop
   */
  async getAllSyncStatuses(
    shopId: string,
    locale?: string,
    resourceType?: string
  ): Promise<TranslationSyncStatus[]> {
    const where: any = { shopId };

    if (locale) {
      where.language = { locale };
    }

    if (resourceType) {
      where.contentHash = { resourceType };
    }

    const translations = await this.prisma.translation.findMany({
      where,
      include: {
        contentHash: true,
        language: true,
      },
    });

    return translations.map((t) => {
      const syncStatus = this.determineSyncStatus(
        {
          status: t.status,
          updatedAt: t.updatedAt,
          errorMessage: t.errorMessage,
        },
        {
          updatedAt: t.contentHash.updatedAt,
        }
      );

      return {
        translationId: t.id,
        contentHashId: t.contentHashId,
        languageId: t.languageId,
        locale: t.language.locale,
        resourceType: t.contentHash.resourceType,
        resourceId: t.contentHash.resourceId,
        fieldName: t.contentHash.fieldName,
        syncStatus,
        contentUpdatedAt: t.contentHash.updatedAt,
        translationUpdatedAt: t.updatedAt,
        translationStatus: t.status,
      };
    });
  }

  /**
   * Get sync statistics aggregated by various dimensions
   * Returns counts of translations in each sync status
   */
  async getSyncAggregation(
    shopId: string,
    locale?: string,
    resourceType?: string
  ): Promise<SyncAggregation> {
    // Get all sync statuses
    const statuses = await this.getAllSyncStatuses(shopId, locale, resourceType);

    // Count by sync status
    const counts = {
      total: statuses.length,
      synced: 0,
      outdated: 0,
      pending: 0,
      error: 0,
    };

    for (const status of statuses) {
      counts[status.syncStatus]++;
    }

    return {
      shopId,
      locale,
      resourceType,
      ...counts,
    };
  }

  /**
   * Get sync aggregation grouped by locale
   */
  async getSyncAggregationByLocale(
    shopId: string,
    resourceType?: string
  ): Promise<Map<string, SyncAggregation>> {
    // Get all languages for the shop
    const languages = await this.prisma.language.findMany({
      where: { shopId, isEnabled: true },
    });

    const results = new Map<string, SyncAggregation>();

    for (const language of languages) {
      const aggregation = await this.getSyncAggregation(
        shopId,
        language.locale,
        resourceType
      );
      results.set(language.locale, aggregation);
    }

    return results;
  }

  /**
   * Get sync aggregation grouped by resource type
   */
  async getSyncAggregationByResourceType(
    shopId: string,
    locale?: string
  ): Promise<Map<string, SyncAggregation>> {
    // Get all unique resource types for the shop
    const contentHashes = await this.prisma.contentHash.findMany({
      where: { shopId },
      select: { resourceType: true },
      distinct: ['resourceType'],
    });

    const results = new Map<string, SyncAggregation>();

    for (const { resourceType } of contentHashes) {
      const aggregation = await this.getSyncAggregation(
        shopId,
        locale,
        resourceType
      );
      results.set(resourceType, aggregation);
    }

    return results;
  }

  /**
   * Mark translations as outdated when content hash changes
   * This can be called after content hash update
   */
  async markTranslationsAsOutdated(
    contentHashId: string
  ): Promise<{ updated: number }> {
    // Get all completed translations for this content hash
    const translations = await this.prisma.translation.findMany({
      where: {
        contentHashId,
        status: 'COMPLETED',
      },
    });

    // Note: We don't actually update the status here, because the outdated
    // state is determined by comparing timestamps. This method is here for
    // potential future use if we want to add an explicit "outdated" flag.

    return { updated: translations.length };
  }
}

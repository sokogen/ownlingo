// Dashboard types for translation status overview

export interface TranslationStats {
  total: number;
  translated: number;
  untranslated: number;
  outdated: number;
  pending: number;
  failed: number;
  progress: number; // 0-100 percentage
}

export interface StatsByType {
  resourceType: string;
  stats: TranslationStats;
}

export interface UntranslatedResource {
  resourceId: string;
  resourceType: string;
  title: string;
  contentHash: string;
  locale: string;
  missingLocales: string[];
}

export interface OutdatedResource {
  resourceId: string;
  resourceType: string;
  title: string;
  locale: string;
  sourceLocale: string;
  currentHash: string;
  translatedHash: string;
  translationId: string;
}

export type ContentStatus = 'synced' | 'outdated' | 'pending' | 'error';

export interface FilterOptions {
  resourceType?: string;
  locale?: string;
  status?: ContentStatus;
  limit?: number;
  offset?: number;
}

export interface DashboardData {
  overallStats: TranslationStats;
  statsByType: StatsByType[];
  untranslated: UntranslatedResource[];
  outdated: OutdatedResource[];
}

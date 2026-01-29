// Shopify Translation Pusher - Push translations back to Shopify
// ol-fy8: Shopify Translation Push

import { ShopifyGraphQLClient } from './client';
import { TRANSLATIONS_REGISTER_MUTATION } from './mutations';

export interface Translation {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest?: string;
}

export interface TranslationInput {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest?: string;
}

export interface PushResult {
  resourceId: string;
  success: boolean;
  translationsCount: number;
  errors: UserError[];
}

export interface UserError {
  message: string;
  field: string[];
}

export interface TranslationBatch {
  resourceId: string;
  translations: TranslationInput[];
}

export interface PushOptions {
  batchSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
  onProgress?: (progress: PushProgress) => void;
}

export interface PushProgress {
  total: number;
  completed: number;
  failed: number;
  percentage: number;
}

export class ShopifyTranslationPusher {
  private client: ShopifyGraphQLClient;
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly DEFAULT_RETRY_DELAY = 1000; // ms

  constructor(client: ShopifyGraphQLClient) {
    this.client = client;
  }

  /**
   * Push translations for a single resource
   */
  async pushResourceTranslations(
    resourceId: string,
    translations: TranslationInput[],
    options: PushOptions = {}
  ): Promise<PushResult> {
    const { retryAttempts = this.DEFAULT_RETRY_ATTEMPTS, retryDelay = this.DEFAULT_RETRY_DELAY } = options;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < retryAttempts) {
      try {
        const response = await this.client.mutate(TRANSLATIONS_REGISTER_MUTATION, {
          resourceId,
          translations,
        });

        const userErrors = response.translationsRegister?.userErrors || [];

        return {
          resourceId,
          success: userErrors.length === 0,
          translationsCount: translations.length,
          errors: userErrors,
        };
      } catch (error: any) {
        lastError = error;
        attempt++;

        if (attempt < retryAttempts) {
          await this.delay(retryDelay * attempt); // Exponential backoff
        }
      }
    }

    return {
      resourceId,
      success: false,
      translationsCount: 0,
      errors: [
        {
          message: lastError?.message || 'Unknown error occurred',
          field: [],
        },
      ],
    };
  }

  /**
   * Push translations for multiple resources in batches
   */
  async pushBatch(
    batches: TranslationBatch[],
    options: PushOptions = {}
  ): Promise<PushResult[]> {
    const { batchSize = this.DEFAULT_BATCH_SIZE, onProgress } = options;
    const results: PushResult[] = [];
    let completed = 0;
    let failed = 0;

    // Process batches sequentially to avoid rate limiting
    for (let i = 0; i < batches.length; i += batchSize) {
      const chunk = batches.slice(i, Math.min(i + batchSize, batches.length));

      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(async (batch) => {
          const result = await this.pushResourceTranslations(
            batch.resourceId,
            batch.translations,
            options
          );

          if (result.success) {
            completed++;
          } else {
            failed++;
          }

          return result;
        })
      );

      results.push(...chunkResults);

      // Report progress
      if (onProgress) {
        const progress: PushProgress = {
          total: batches.length,
          completed,
          failed,
          percentage: Math.round((completed + failed) / batches.length * 100),
        };
        onProgress(progress);
      }

      // Add delay between chunks to avoid rate limiting
      if (i + batchSize < batches.length) {
        await this.delay(500);
      }
    }

    return results;
  }

  /**
   * Verify that translations were successfully applied
   * by fetching the resource and checking the translation values
   */
  async verifyTranslations(
    resourceId: string,
    expectedTranslations: TranslationInput[]
  ): Promise<{
    verified: boolean;
    mismatches: Array<{
      key: string;
      locale: string;
      expected: string;
      actual: string | null;
    }>;
  }> {
    // Query to fetch current translations for a resource
    const VERIFY_QUERY = `
      query getTranslations($resourceId: ID!) {
        translatableResource(resourceId: $resourceId) {
          resourceId
          translations(locale: $locale) {
            key
            value
            locale
          }
        }
      }
    `;

    const mismatches: Array<{
      key: string;
      locale: string;
      expected: string;
      actual: string | null;
    }> = [];

    // Group translations by locale
    const translationsByLocale = expectedTranslations.reduce((acc, t) => {
      if (!acc[t.locale]) {
        acc[t.locale] = [];
      }
      acc[t.locale].push(t);
      return acc;
    }, {} as Record<string, TranslationInput[]>);

    // Verify each locale
    for (const [locale, translations] of Object.entries(translationsByLocale)) {
      try {
        const response = await this.client.query(VERIFY_QUERY, {
          resourceId,
          locale,
        });

        const actualTranslations = response.translatableResource?.translations || [];
        const translationMap = new Map(
          actualTranslations.map((t: any) => [t.key, t.value])
        );

        for (const expected of translations) {
          const actual = translationMap.get(expected.key);

          if (actual !== expected.value) {
            mismatches.push({
              key: expected.key,
              locale: expected.locale,
              expected: expected.value,
              actual: actual || null,
            });
          }
        }
      } catch (error: any) {
        // If verification fails, consider it a mismatch
        mismatches.push({
          key: 'verification_failed',
          locale,
          expected: 'verification',
          actual: null,
        });
      }
    }

    return {
      verified: mismatches.length === 0,
      mismatches,
    };
  }

  /**
   * Get summary statistics from push results
   */
  getSummary(results: PushResult[]): {
    total: number;
    successful: number;
    failed: number;
    totalTranslations: number;
    errors: UserError[];
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalTranslations = results.reduce((sum, r) => sum + r.translationsCount, 0);
    const errors = results.flatMap(r => r.errors);

    return {
      total: results.length,
      successful,
      failed,
      totalTranslations,
      errors,
    };
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Tests for Dashboard Service
// ol-008: Dashboard UI

import { Schema } from '../src/db/schema';
import { DashboardService } from '../src/dashboard/dashboard-service';
import { ContentHasher } from '../src/utils/content-hash';

describe('DashboardService', () => {
  let schema: Schema;
  let dashboard: DashboardService;
  let hasher: ContentHasher;

  beforeEach(() => {
    schema = new Schema(':memory:');
    dashboard = new DashboardService(schema.getDatabase());
    hasher = new ContentHasher();
  });

  afterEach(() => {
    schema.close();
  });

  describe('getOverallStats', () => {
    it('should return zero stats for empty database', () => {
      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats).toEqual({
        total: 0,
        translated: 0,
        untranslated: 0,
        outdated: 0,
        pending: 0,
        failed: 0,
        progress: 0,
      });
    });

    it('should count untranslated resources correctly', () => {
      const db = schema.getDatabase();

      // Add 3 resources without translations
      for (let i = 1; i <= 3; i++) {
        const content = `Product ${i}`;
        const hash = hasher.hash({ content });
        db.prepare(`
          INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `res-${i}`,
          `shop-${i}`,
          'product',
          `Product ${i}`,
          content,
          hash,
          'en',
          Date.now(),
          Date.now()
        );
      }

      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats.total).toBe(3);
      expect(stats.untranslated).toBe(3);
      expect(stats.translated).toBe(0);
      expect(stats.outdated).toBe(0);
      expect(stats.progress).toBe(0);
    });

    it('should count translated resources correctly', () => {
      const db = schema.getDatabase();

      // Add resource and translation with matching hash
      const content = 'Product 1';
      const hash = hasher.hash({ content });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', content, hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', hash, 'Produit 1', 'mock', Date.now());

      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats.total).toBe(1);
      expect(stats.translated).toBe(1);
      expect(stats.untranslated).toBe(0);
      expect(stats.outdated).toBe(0);
      expect(stats.progress).toBe(100);
    });

    it('should count outdated resources correctly', () => {
      const db = schema.getDatabase();

      // Add resource with translation but mismatched hash (content changed)
      const oldContent = 'Old product';
      const newContent = 'New product';
      const oldHash = hasher.hash({ content: oldContent });
      const newHash = hasher.hash({ content: newContent });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', newContent, newHash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', oldHash, 'Vieux produit', 'mock', Date.now());

      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats.total).toBe(1);
      expect(stats.translated).toBe(0);
      expect(stats.untranslated).toBe(0);
      expect(stats.outdated).toBe(1);
      expect(stats.progress).toBe(0);
    });

    it('should count pending job items correctly', () => {
      const db = schema.getDatabase();

      // Add a job with pending items
      const content = 'Product 1';
      const hash = hasher.hash({ content });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', content, hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, total_items, completed_items, failed_items, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('job-1', 'single', 'pending', 0, 'en', JSON.stringify(['fr']), 1, 0, 0, 0, Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_job_items (id, job_id, resource_id, target_locale, status, retry_count, max_retries, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', 'job-1', 'res-1', 'fr', 'pending', 0, 3, Date.now(), Date.now());

      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats.pending).toBe(1);
    });

    it('should count failed job items correctly', () => {
      const db = schema.getDatabase();

      // Add a job with failed item
      const content = 'Product 1';
      const hash = hasher.hash({ content });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', content, hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, total_items, completed_items, failed_items, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('job-1', 'single', 'running', 0, 'en', JSON.stringify(['fr']), 1, 0, 1, 0, Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_job_items (id, job_id, resource_id, target_locale, status, retry_count, max_retries, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', 'job-1', 'res-1', 'fr', 'failed', 3, 3, 'Translation failed', Date.now(), Date.now());

      const stats = dashboard.getOverallStats('en', 'fr');

      expect(stats.failed).toBe(1);
    });
  });

  describe('getStatsByType', () => {
    it('should return empty array for no resources', () => {
      const stats = dashboard.getStatsByType('en', 'fr');
      expect(stats).toEqual([]);
    });

    it('should group stats by resource type', () => {
      const db = schema.getDatabase();

      // Add 2 products and 1 collection
      const products = ['Product 1', 'Product 2'];
      const collections = ['Collection 1'];

      products.forEach((title, i) => {
        const hash = hasher.hash({ content: title });
        db.prepare(`
          INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`prod-${i}`, `shop-${i}`, 'product', title, title, hash, 'en', Date.now(), Date.now());
      });

      collections.forEach((title, i) => {
        const hash = hasher.hash({ content: title });
        db.prepare(`
          INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`coll-${i}`, `shop-coll-${i}`, 'collection', title, title, hash, 'en', Date.now(), Date.now());
      });

      const stats = dashboard.getStatsByType('en', 'fr');

      expect(stats).toHaveLength(2);

      const productStats = stats.find((s) => s.resourceType === 'product');
      const collectionStats = stats.find((s) => s.resourceType === 'collection');

      expect(productStats).toBeDefined();
      expect(productStats!.stats.total).toBe(2);
      expect(productStats!.stats.untranslated).toBe(2);

      expect(collectionStats).toBeDefined();
      expect(collectionStats!.stats.total).toBe(1);
      expect(collectionStats!.stats.untranslated).toBe(1);
    });
  });

  describe('findUntranslated', () => {
    it('should find resources without translations', () => {
      const db = schema.getDatabase();

      // Add 2 resources without translations
      for (let i = 1; i <= 2; i++) {
        const content = `Product ${i}`;
        const hash = hasher.hash({ content });
        db.prepare(`
          INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`res-${i}`, `shop-${i}`, 'product', `Product ${i}`, content, hash, 'en', Date.now(), Date.now());
      }

      const untranslated = dashboard.findUntranslated('en', 'fr');

      expect(untranslated).toHaveLength(2);
      expect(untranslated[0].resourceType).toBe('product');
      expect(untranslated[0].missingLocales).toEqual(['fr']);
    });

    it('should filter by resource type', () => {
      const db = schema.getDatabase();

      // Add 1 product and 1 collection without translations
      const hash1 = hasher.hash({ content: 'Product 1' });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('prod-1', 'shop-1', 'product', 'Product 1', 'Product 1', hash1, 'en', Date.now(), Date.now());

      const hash2 = hasher.hash({ content: 'Collection 1' });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('coll-1', 'shop-coll-1', 'collection', 'Collection 1', 'Collection 1', hash2, 'en', Date.now(), Date.now());

      const untranslated = dashboard.findUntranslated('en', 'fr', { resourceType: 'product' });

      expect(untranslated).toHaveLength(1);
      expect(untranslated[0].resourceType).toBe('product');
    });

    it('should respect limit and offset', () => {
      const db = schema.getDatabase();

      // Add 5 resources
      for (let i = 1; i <= 5; i++) {
        const content = `Product ${i}`;
        const hash = hasher.hash({ content });
        db.prepare(`
          INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`res-${i}`, `shop-${i}`, 'product', `Product ${i}`, content, hash, 'en', Date.now(), Date.now());
      }

      const page1 = dashboard.findUntranslated('en', 'fr', { limit: 2, offset: 0 });
      const page2 = dashboard.findUntranslated('en', 'fr', { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });
  });

  describe('findOutdated', () => {
    it('should find resources with outdated translations', () => {
      const db = schema.getDatabase();

      // Add resource with outdated translation
      const oldContent = 'Old product';
      const newContent = 'New product';
      const oldHash = hasher.hash({ content: oldContent });
      const newHash = hasher.hash({ content: newContent });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', newContent, newHash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', oldHash, 'Vieux produit', 'mock', Date.now());

      const outdated = dashboard.findOutdated('en', 'fr');

      expect(outdated).toHaveLength(1);
      expect(outdated[0].resourceId).toBe('res-1');
      expect(outdated[0].currentHash).toBe(newHash);
      expect(outdated[0].translatedHash).toBe(oldHash);
    });

    it('should not return up-to-date translations', () => {
      const db = schema.getDatabase();

      // Add resource with current translation
      const content = 'Product 1';
      const hash = hasher.hash({ content });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', content, hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', hash, 'Produit 1', 'mock', Date.now());

      const outdated = dashboard.findOutdated('en', 'fr');

      expect(outdated).toHaveLength(0);
    });
  });

  describe('getDashboardData', () => {
    it('should return complete dashboard data', () => {
      const db = schema.getDatabase();

      // Add one untranslated, one translated, one outdated
      const content1 = 'Product 1';
      const hash1 = hasher.hash({ content: content1 });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', content1, hash1, 'en', Date.now(), Date.now());

      const content2 = 'Product 2';
      const hash2 = hasher.hash({ content: content2 });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-2', 'shop-2', 'product', 'Product 2', content2, hash2, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-2', 'res-2', 'en', 'fr', hash2, 'Produit 2', 'mock', Date.now());

      const newContent3 = 'Product 3 updated';
      const oldHash3 = hasher.hash({ content: 'Product 3 old' });
      const newHash3 = hasher.hash({ content: newContent3 });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-3', 'shop-3', 'product', 'Product 3', newContent3, newHash3, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-3', 'res-3', 'en', 'fr', oldHash3, 'Produit 3 ancien', 'mock', Date.now());

      const data = dashboard.getDashboardData('en', 'fr');

      expect(data.overallStats.total).toBe(3);
      expect(data.overallStats.translated).toBe(1);
      expect(data.overallStats.untranslated).toBe(1);
      expect(data.overallStats.outdated).toBe(1);
      expect(data.statsByType).toHaveLength(1);
      expect(data.statsByType[0].resourceType).toBe('product');
      expect(data.untranslated).toHaveLength(1);
      expect(data.outdated).toHaveLength(1);
    });
  });

  describe('getContentStatus', () => {
    it('should return pending for missing translation', () => {
      const db = schema.getDatabase();

      const hash = hasher.hash({ content: 'Product 1' });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', 'Product 1', hash, 'en', Date.now(), Date.now());

      const status = dashboard.getContentStatus('res-1', 'fr');
      expect(status).toBe('pending');
    });

    it('should return synced for current translation', () => {
      const db = schema.getDatabase();

      const hash = hasher.hash({ content: 'Product 1' });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', 'Product 1', hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', hash, 'Produit 1', 'mock', Date.now());

      const status = dashboard.getContentStatus('res-1', 'fr');
      expect(status).toBe('synced');
    });

    it('should return outdated for hash mismatch', () => {
      const db = schema.getDatabase();

      const oldHash = hasher.hash({ content: 'Old' });
      const newHash = hasher.hash({ content: 'New' });

      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', 'New', newHash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translations (id, resource_id, source_locale, target_locale, source_hash, translated_content, provider, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('trans-1', 'res-1', 'en', 'fr', oldHash, 'Ancien', 'mock', Date.now());

      const status = dashboard.getContentStatus('res-1', 'fr');
      expect(status).toBe('outdated');
    });

    it('should return error for failed job items', () => {
      const db = schema.getDatabase();

      const hash = hasher.hash({ content: 'Product 1' });
      db.prepare(`
        INSERT INTO resources (id, shopify_id, resource_type, title, content, content_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('res-1', 'shop-1', 'product', 'Product 1', 'Product 1', hash, 'en', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, total_items, completed_items, failed_items, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('job-1', 'single', 'running', 0, 'en', JSON.stringify(['fr']), 1, 0, 1, 0, Date.now(), Date.now());

      db.prepare(`
        INSERT INTO translation_job_items (id, job_id, resource_id, target_locale, status, retry_count, max_retries, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', 'job-1', 'res-1', 'fr', 'failed', 3, 3, 'Failed', Date.now(), Date.now());

      const status = dashboard.getContentStatus('res-1', 'fr');
      expect(status).toBe('error');
    });
  });
});

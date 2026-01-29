// Tests for Database Schema
// ol-001: Database Schema

import { Schema } from '../src/db/schema';

describe('Schema', () => {
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema(':memory:');
  });

  afterEach(() => {
    schema.close();
  });

  describe('table creation', () => {
    test('should create all required tables', () => {
      const db = schema.getDatabase();

      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();

      const tableNames = tables.map((t: any) => t.name);

      expect(tableNames).toContain('resources');
      expect(tableNames).toContain('translation_jobs');
      expect(tableNames).toContain('translation_job_items');
      expect(tableNames).toContain('translations');
    });

    test('should create indexes', () => {
      const db = schema.getDatabase();

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index'
      `).all();

      const indexNames = indexes.map((i: any) => i.name);

      expect(indexNames).toContain('idx_resources_hash');
      expect(indexNames).toContain('idx_jobs_status');
      expect(indexNames).toContain('idx_items_job');
    });
  });

  describe('data integrity', () => {
    test('should enforce job type constraints', () => {
      const db = schema.getDatabase();

      expect(() => {
        db.prepare(`
          INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, created_at, updated_at)
          VALUES ('test', 'invalid', 'pending', 0, 'en', '[]', 0, 0)
        `).run();
      }).toThrow();
    });

    test('should enforce job status constraints', () => {
      const db = schema.getDatabase();

      expect(() => {
        db.prepare(`
          INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, created_at, updated_at)
          VALUES ('test', 'full', 'invalid', 0, 'en', '[]', 0, 0)
        `).run();
      }).toThrow();
    });

    test('should allow valid job insertion', () => {
      const db = schema.getDatabase();

      expect(() => {
        db.prepare(`
          INSERT INTO translation_jobs (id, type, status, priority, source_locale, target_locales, created_at, updated_at)
          VALUES ('test', 'full', 'pending', 0, 'en', '["fr","es"]', 0, 0)
        `).run();
      }).not.toThrow();

      const job = db.prepare('SELECT * FROM translation_jobs WHERE id = ?').get('test');
      expect(job).toBeTruthy();
    });
  });
});

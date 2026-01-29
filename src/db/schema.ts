// Database schema for translation system
// ol-001: Database Schema

import Database from 'better-sqlite3';

export interface TranslationResource {
  id: string;
  shopify_id: string;
  resource_type: string; // product, collection, page, etc.
  title: string;
  content: string;
  content_hash: string;
  locale: string;
  created_at: number;
  updated_at: number;
}

export interface TranslationJob {
  id: string;
  type: 'full' | 'incremental' | 'single';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  source_locale: string;
  target_locales: string[]; // JSON array
  total_items: number;
  completed_items: number;
  failed_items: number;
  progress: number; // 0-100
  error_message?: string;
  created_at: number;
  updated_at: number;
  started_at?: number;
  completed_at?: number;
}

export interface TranslationJobItem {
  id: string;
  job_id: string;
  resource_id: string;
  target_locale: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  max_retries: number;
  error_message?: string;
  translated_content?: string;
  created_at: number;
  updated_at: number;
}

export interface Translation {
  id: string;
  resource_id: string;
  source_locale: string;
  target_locale: string;
  source_hash: string;
  translated_content: string;
  provider: string;
  created_at: number;
}

export class Schema {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.createTables();
  }

  private createTables(): void {
    // Resources table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        shopify_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        locale TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resources_hash ON resources(content_hash);
      CREATE INDEX IF NOT EXISTS idx_resources_shopify ON resources(shopify_id);
    `);

    // Translation jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translation_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('full', 'incremental', 'single')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        priority INTEGER NOT NULL DEFAULT 0,
        source_locale TEXT NOT NULL,
        target_locales TEXT NOT NULL,
        total_items INTEGER NOT NULL DEFAULT 0,
        completed_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        progress REAL NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON translation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_priority ON translation_jobs(priority DESC);
    `);

    // Job items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translation_job_items (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        target_locale TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        translated_content TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (job_id) REFERENCES translation_jobs(id),
        FOREIGN KEY (resource_id) REFERENCES resources(id)
      );
      CREATE INDEX IF NOT EXISTS idx_items_job ON translation_job_items(job_id);
      CREATE INDEX IF NOT EXISTS idx_items_status ON translation_job_items(status);
    `);

    // Translations table (cache)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        source_locale TEXT NOT NULL,
        target_locale TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        translated_content TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (resource_id) REFERENCES resources(id)
      );
      CREATE INDEX IF NOT EXISTS idx_translations_hash ON translations(source_hash, target_locale);
    `);
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

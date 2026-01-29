// Content Hash System for detecting changes
// ol-004: Content Hash System

import * as crypto from 'crypto';

export interface HashableContent {
  text: string;
  metadata?: Record<string, any>;
}

export class ContentHasher {
  /**
   * Generate a hash for content to detect changes
   * Uses SHA-256 for reliable change detection
   */
  static hash(content: HashableContent): string {
    const normalizedContent = this.normalizeContent(content);
    const hash = crypto.createHash('sha256');
    hash.update(normalizedContent);
    return hash.digest('hex');
  }

  /**
   * Normalize content before hashing to ensure consistent results
   */
  private static normalizeContent(content: HashableContent): string {
    // Normalize whitespace and trim
    let normalized = content.text.trim().replace(/\s+/g, ' ');

    // Include metadata if present
    if (content.metadata) {
      const metadataStr = JSON.stringify(content.metadata, Object.keys(content.metadata).sort());
      normalized = `${normalized}::${metadataStr}`;
    }

    return normalized;
  }

  /**
   * Compare two content hashes
   */
  static areEqual(hash1: string, hash2: string): boolean {
    return hash1 === hash2;
  }

  /**
   * Check if content has changed by comparing hashes
   */
  static hasChanged(oldHash: string, newContent: HashableContent): boolean {
    const newHash = this.hash(newContent);
    return !this.areEqual(oldHash, newHash);
  }
}

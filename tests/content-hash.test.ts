// Tests for Content Hash System
// ol-004: Content Hash System

import { ContentHasher } from '../src/utils/content-hash';

describe('ContentHasher', () => {
  describe('hash generation', () => {
    test('should generate consistent hash for same content', () => {
      const content = { text: 'Hello world' };
      const hash1 = ContentHasher.hash(content);
      const hash2 = ContentHasher.hash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    test('should generate different hashes for different content', () => {
      const content1 = { text: 'Hello world' };
      const content2 = { text: 'Goodbye world' };

      const hash1 = ContentHasher.hash(content1);
      const hash2 = ContentHasher.hash(content2);

      expect(hash1).not.toBe(hash2);
    });

    test('should normalize whitespace', () => {
      const content1 = { text: 'Hello  world' };
      const content2 = { text: 'Hello world' };

      const hash1 = ContentHasher.hash(content1);
      const hash2 = ContentHasher.hash(content2);

      expect(hash1).toBe(hash2);
    });

    test('should include metadata in hash', () => {
      const content1 = { text: 'Hello', metadata: { type: 'greeting' } };
      const content2 = { text: 'Hello', metadata: { type: 'farewell' } };

      const hash1 = ContentHasher.hash(content1);
      const hash2 = ContentHasher.hash(content2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hash comparison', () => {
    test('should correctly compare equal hashes', () => {
      const content = { text: 'Test' };
      const hash1 = ContentHasher.hash(content);
      const hash2 = ContentHasher.hash(content);

      expect(ContentHasher.areEqual(hash1, hash2)).toBe(true);
    });

    test('should correctly compare different hashes', () => {
      const hash1 = ContentHasher.hash({ text: 'Test 1' });
      const hash2 = ContentHasher.hash({ text: 'Test 2' });

      expect(ContentHasher.areEqual(hash1, hash2)).toBe(false);
    });
  });

  describe('change detection', () => {
    test('should detect when content has changed', () => {
      const oldContent = { text: 'Original text' };
      const newContent = { text: 'Modified text' };

      const oldHash = ContentHasher.hash(oldContent);
      const hasChanged = ContentHasher.hasChanged(oldHash, newContent);

      expect(hasChanged).toBe(true);
    });

    test('should detect when content has not changed', () => {
      const content = { text: 'Same text' };

      const oldHash = ContentHasher.hash(content);
      const hasChanged = ContentHasher.hasChanged(oldHash, content);

      expect(hasChanged).toBe(false);
    });
  });
});

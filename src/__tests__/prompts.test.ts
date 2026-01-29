import { describe, it, expect } from 'vitest';
import { getTranslationSystemPrompt, getTranslationUserPrompt } from '../prompts.js';

describe('getTranslationSystemPrompt', () => {
  it('should mention HTML tags preservation', () => {
    const prompt = getTranslationSystemPrompt();
    expect(prompt).toContain('HTML tags');
    expect(prompt).toContain('<strong>');
  });

  it('should mention Liquid tags preservation', () => {
    const prompt = getTranslationSystemPrompt();
    expect(prompt).toContain('Liquid');
    expect(prompt).toContain('{{ variable }}');
    expect(prompt).toContain('{% if');
  });

  it('should mention placeholder preservation', () => {
    const prompt = getTranslationSystemPrompt();
    expect(prompt).toContain('{0}');
    expect(prompt).toContain('%s');
  });

  it('should mention URLs preservation', () => {
    const prompt = getTranslationSystemPrompt();
    expect(prompt).toContain('URL');
  });

  it('should instruct to respond with only translated text', () => {
    const prompt = getTranslationSystemPrompt();
    expect(prompt).toContain('ONLY the translated text');
  });
});

describe('getTranslationUserPrompt', () => {
  it('should include source and target languages', () => {
    const prompt = getTranslationUserPrompt('Hello', 'English', 'Spanish');
    expect(prompt).toContain('English');
    expect(prompt).toContain('Spanish');
  });

  it('should include the text to translate', () => {
    const prompt = getTranslationUserPrompt('Hello world', 'English', 'Spanish');
    expect(prompt).toContain('Hello world');
  });

  it('should include context when provided', () => {
    const prompt = getTranslationUserPrompt('Hello', 'English', 'Spanish', 'This is a greeting');
    expect(prompt).toContain('Context: This is a greeting');
  });

  it('should not include context when not provided', () => {
    const prompt = getTranslationUserPrompt('Hello', 'English', 'Spanish');
    expect(prompt).not.toContain('Context:');
  });
});

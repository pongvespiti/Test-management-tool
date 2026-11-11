import { describe, expect, it } from '@jest/globals';
import { normalizeReference, normalizeReferences, parseReferences } from '../src';

describe('references', () => {
  it('gives id-like items one canonical spelling', () => {
    expect(normalizeReference('req 1')).toBe('REQ-1');
    expect(normalizeReference('Req_001')).toBe('REQ-001');
    expect(normalizeReference(' proj-123 ')).toBe('PROJ-123');
    expect(normalizeReference('SPEC4.2')).toBe('SPEC-4.2');
  });

  it('keeps other items as typed', () => {
    expect(normalizeReference('3.2.1')).toBe('3.2.1');
    expect(normalizeReference('minutes  of 3 Nov')).toBe('minutes of 3 Nov');
    expect(normalizeReference('   ')).toBe('');
  });

  it('splits on comma, semicolon and new lines and drops duplicates', () => {
    expect(parseReferences('req 1, REQ-1;PROJ-9\n\nproj 9 , spec')).toEqual([
      'REQ-1',
      'PROJ-9',
      'spec',
    ]);
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences(' , ;')).toEqual([]);
  });

  it('rewrites the text or returns null', () => {
    expect(normalizeReferences('req 1;  proj_2')).toBe('REQ-1, PROJ-2');
    expect(normalizeReferences('  ')).toBeNull();
    expect(normalizeReferences(undefined)).toBeNull();
  });
});

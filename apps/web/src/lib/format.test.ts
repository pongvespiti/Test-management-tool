import { describe, expect, it } from '@jest/globals';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  initials,
  pluralize,
} from './format';

describe('format helpers', () => {
  it('formats dates and date-times, with a dash for missing values', () => {
    expect(formatDate('2026-10-21')).toBe('Oct 21, 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
    expect(formatDateTime('2026-10-21T14:05:00')).toBe('Oct 21, 2026 14:05');
  });

  it('formats sizes and counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatBytes(-1)).toBe('—');
    expect(pluralize(1, 'case')).toBe('1 case');
    expect(pluralize(1200, 'case')).toBe('1,200 cases');
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('derives avatar initials', () => {
    expect(initials('Somchai Jaidee')).toBe('SJ');
    expect(initials('admin')).toBe('AD');
    expect(initials('  ')).toBe('?');
  });
});

import { describe, expect, it } from '@jest/globals';
import { formatClock, formatDuration } from './time';

describe('time formatting', () => {
  it('formats a timer', () => {
    expect(formatClock(754)).toBe('12:34');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('formats a duration', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(420)).toBe('7m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3725)).toBe('1h 2m');
  });
});

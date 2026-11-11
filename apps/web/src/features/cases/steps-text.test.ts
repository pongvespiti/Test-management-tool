import { describe, expect, it } from '@jest/globals';
import { splitNumbered, textToSteps } from './steps-text';

describe('splitNumbered', () => {
  it('splits numbered lines, keeps continuation lines and the text before the first number', () => {
    expect(splitNumbered('Setup\r\n1. Press ON\n   hold 3 s\n2) Wait\n10.Check 1.5 V')).toEqual({
      preamble: 'Setup',
      items: [
        { n: 1, text: 'Press ON\n   hold 3 s' },
        { n: 2, text: 'Wait' },
        { n: 10, text: 'Check 1.5 V' },
      ],
    });
  });

  it('does not take a decimal for a number', () => {
    expect(splitNumbered('1.5 V is fine')).toEqual({ preamble: '1.5 V is fine', items: [] });
  });
});

describe('textToSteps', () => {
  it('returns no steps for empty text and one step for unnumbered text', () => {
    expect(textToSteps('', ' ')).toEqual([]);
    expect(textToSteps('Press ON', ' Starts ')).toEqual([
      { action: 'Press ON', expected: 'Starts' },
    ]);
    expect(textToSteps('', 'Starts')).toEqual([{ action: '', expected: 'Starts' }]);
  });

  it('matches expected lines to the step with the same number', () => {
    expect(textToSteps('1. Press ON\n2. Wait\n3. Check', '2. Fan runs\n3. LED green')).toEqual([
      { action: 'Press ON', expected: '' },
      { action: 'Wait', expected: 'Fan runs' },
      { action: 'Check', expected: 'LED green' },
    ]);
  });

  it('keeps every piece of text', () => {
    expect(textToSteps('Setup\n1. Press ON\n2. Wait', 'All fine')).toEqual([
      { action: 'Setup\nPress ON', expected: '' },
      { action: 'Wait', expected: 'All fine' },
    ]);
    expect(textToSteps('1. A\n1. B', 'Note\n1. X\n1. Y\n7. Z')).toEqual([
      { action: 'A', expected: 'Note\nX' },
      { action: 'B', expected: 'Y\nZ' },
    ]);
    expect(textToSteps('1. A', '')).toEqual([{ action: 'A', expected: '' }]);
  });
});

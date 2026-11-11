import { describe, expect, it } from '@jest/globals';
import { csvCell, toCsv } from './save-file';

describe('csv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(7)).toBe('7');
  });

  it('starts with a byte-order mark and ends rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, 'c,d'],
      ]),
    ).toBe('﻿a,b\r\n1,"c,d"\r\n');
  });
});

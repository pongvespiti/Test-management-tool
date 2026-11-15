/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { STAND_REQUEST_KIND_LABELS, STAND_REQUEST_STATUS_LABELS } from '@tmt/shared';
import { STANDS_TH, standsText } from './stand-i18n';

/** Every `t('…')` text of the stands page. */
function textsInSource(): string[] {
  const dir = __dirname;
  const out = new Set<string>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.tsx') || file.endsWith('.test.tsx')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*(['"])((?:(?!\1).)+)\1/g)) out.add(m[2]!);
    // t(cond ? 'a' : 'b')
    for (const m of src.matchAll(/\bt\(\s*[^'"()]+\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
      out.add(m[1]!);
      out.add(m[2]!);
    }
  }
  return [...out];
}

describe('Thai wording of the stands page', () => {
  it('has a translation for every text the page shows', () => {
    const texts = textsInSource();
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.filter((t) => !(t in STANDS_TH))).toEqual([]);
    const labels = [
      ...Object.values(STAND_REQUEST_KIND_LABELS),
      ...Object.values(STAND_REQUEST_STATUS_LABELS),
    ];
    expect(labels.filter((t) => !(t in STANDS_TH))).toEqual([]);
  });

  it('keeps the placeholders of each text', () => {
    for (const [en, th] of Object.entries(STANDS_TH)) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect([en, names(th)]).toEqual([en, names(en)]);
    }
  });

  it('fills values in, and stays English unless Thai is chosen', () => {
    expect(standsText('th', 'Edit {code}', { code: 'L1/A-1' })).toBe('แก้ไข L1/A-1');
    expect(standsText('en', 'Edit {code}', { code: 'L1/A-1' })).toBe('Edit L1/A-1');
  });
});

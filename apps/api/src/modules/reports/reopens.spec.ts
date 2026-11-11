import { describe, expect, it } from '@jest/globals';
import { reopenReportOf, type ReopenDefect } from './reopens.js';

const defect = (id: number, over: Partial<ReopenDefect> = {}): ReopenDefect => ({
  id,
  key: `BUG-${id}`,
  title: `Defect ${id}`,
  status: 'open',
  severity: 'major',
  release: 'Step 1',
  build: 'B1',
  platform: 'Android',
  topic: 'Unit operation test',
  ...over,
});
const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T08:00:00Z`);

describe('reopenReportOf', () => {
  const defects = [
    defect(1),
    defect(2, { platform: 'iOS', build: 'B2' }),
    defect(3, { release: 'Step 2', platform: null, topic: null }),
    defect(4),
  ];
  const events = [
    { defectId: 1, at: at(2) },
    { defectId: 1, at: at(5) },
    { defectId: 1, at: at(9) },
    { defectId: 2, at: at(3) },
    { defectId: 3, at: at(4) },
    { defectId: 3, at: at(6) },
    { defectId: 99, at: at(7) }, // a defect outside the scope
  ];
  const report = reopenReportOf(defects, events);

  it('totals defects, reopened defects, reopen events and repeated defects', () => {
    expect(report.totals).toEqual({
      defects: 4,
      reopenedDefects: 3,
      reopens: 6,
      repeatedDefects: 2,
    });
  });

  it('lists the repeated defects, most reopens first, with the last reopen', () => {
    expect(report.repeated.map((d) => [d.key, d.reopens])).toEqual([
      ['BUG-1', 3],
      ['BUG-3', 2],
    ]);
    expect(report.repeated[0]!.lastReopenedAt).toBe('2026-11-09T08:00:00.000Z');
  });

  it('groups by release, build, platform and topic with the empty value last', () => {
    expect(report.byRelease).toEqual([
      { value: 'Step 1', defects: 3, reopenedDefects: 2, reopens: 4 },
      { value: 'Step 2', defects: 1, reopenedDefects: 1, reopens: 2 },
    ]);
    expect(report.byPlatform.map((g) => g.value)).toEqual(['Android', 'iOS', '']);
    expect(report.byPlatform[0]).toEqual({
      value: 'Android',
      defects: 2,
      reopenedDefects: 1,
      reopens: 3,
    });
    expect(report.byPlatform.at(-1)).toMatchObject({ value: '', defects: 1, reopens: 2 });
    expect(report.byBuild.map((g) => g.value)).toEqual(['B1', 'B2']);
    expect(report.byTopic.map((g) => g.value)).toEqual(['Unit operation test', '']);
  });

  it('is empty without defects', () => {
    expect(reopenReportOf([], [])).toMatchObject({
      totals: { defects: 0, reopenedDefects: 0, reopens: 0, repeatedDefects: 0 },
      byRelease: [],
      repeated: [],
    });
  });
});

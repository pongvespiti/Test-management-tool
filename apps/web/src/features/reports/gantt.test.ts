import { describe, expect, it } from '@jest/globals';
import type { ScheduleDTO, ScheduleItemDTO } from '@tmt/shared';
import { counts } from '@/features/plans/test-fixtures';
import { buildGantt, packLanes, type GanttBar } from './gantt';

const item = (id: number, over: Partial<ScheduleItemDTO> = {}): ScheduleItemDTO => ({
  runId: id,
  planId: 1,
  planDocNo: 'D-1',
  planTitle: 'Plan',
  code: `R${id}`,
  suite: 'Unit operation',
  topic: 'Unit operation test',
  tester: null,
  start: '2026-11-02',
  due: '2026-11-13',
  counts: counts({ untested: 4 }),
  ...over,
});
const person = (id: number, name: string) => ({
  id,
  username: name.toLowerCase(),
  displayName: name,
});
const data = (items: ScheduleItemDTO[], release: ScheduleDTO['release'] = null): ScheduleDTO => ({
  release,
  items,
});
const TODAY = new Date('2026-11-10T09:00:00');

describe('buildGantt', () => {
  it('returns nothing when no run and no release has a date', () => {
    expect(buildGantt(data([item(1, { start: null, due: null })]), 'topic', TODAY)).toBeNull();
  });

  it('keeps runs without dates apart and sizes the range with a day of margin', () => {
    const m = buildGantt(
      data([item(1), item(2, { start: null, due: null, code: 'R2' })]),
      'topic',
      TODAY,
    )!;
    expect(m.unscheduled.map((i) => i.code)).toEqual(['R2']);
    expect(m.start).toBe('2026-11-01');
    expect(m.days).toBe(14); // Nov 1 … Nov 14
    expect(m.rows[0]!.lanes[0]![0]).toMatchObject({ from: 1, to: 12 });
    expect(m.today).toBe(9);
  });

  it('draws a run with one date as a one-day bar and never ends before it starts', () => {
    const m = buildGantt(
      data([
        item(1, { start: null, due: '2026-11-05' }),
        item(2, { start: '2026-11-09', due: '2026-11-03' }),
      ]),
      'topic',
      TODAY,
    )!;
    const bars = m.rows[0]!.lanes.flat();
    const one = bars.find((b) => b.item.runId === 1)!;
    expect(one.from).toBe(one.to);
    const odd = bars.find((b) => b.item.runId === 2)!;
    expect(odd.from).toBe(odd.to);
  });

  it('widens the range to the release dates', () => {
    const m = buildGantt(
      data([item(1)], { id: 5, name: 'Step 1', startDate: '2026-10-26', endDate: '2026-11-27' }),
      'topic',
      TODAY,
    )!;
    expect(m.start).toBe('2026-10-25');
    expect(m.days).toBe(35);
    expect(m.ticks[0]).toEqual({ day: 1, label: 'Oct 26' }); // the first Monday
  });

  it('groups by topic with "No topic" last, or by person with "Not handed out" last', () => {
    const items = [
      item(1, { topic: 'Unit operation test', tester: person(2, 'Bee') }),
      item(2, { topic: null }),
      item(3, { topic: 'Adapter operation test', tester: person(1, 'Ann') }),
    ];
    const byTopic = buildGantt(data(items), 'topic', TODAY)!;
    expect(byTopic.rows.map((r) => r.label)).toEqual([
      'Adapter operation test',
      'Unit operation test',
      'No topic',
    ]);
    const byPerson = buildGantt(data(items), 'person', TODAY)!;
    expect(byPerson.rows.map((r) => r.label)).toEqual(['Ann', 'Bee', 'Not handed out']);
  });

  it('marks a run late when its due date has passed and it is not fully executed', () => {
    const items = [
      item(1, { due: '2026-11-05' }),
      item(2, { due: '2026-11-05', counts: counts({ ok: 4 }) }),
      item(3, { due: '2026-11-20' }),
    ];
    const bars = buildGantt(data(items), 'topic', TODAY)!.rows[0]!.lanes.flat();
    expect(bars.map((b) => [b.item.runId, b.late])).toEqual(
      expect.arrayContaining([
        [1, true],
        [2, false],
        [3, false],
      ]),
    );
  });

  it('has no "today" marker outside the range', () => {
    expect(buildGantt(data([item(1)]), 'topic', new Date('2027-01-01'))!.today).toBeNull();
  });
});

describe('packLanes', () => {
  const bar = (id: number, from: number, to: number): GanttBar => ({
    item: item(id),
    from,
    to,
    late: false,
  });

  it('puts bars that overlap in different lanes and reuses a lane once it is free', () => {
    const lanes = packLanes([bar(1, 0, 4), bar(2, 2, 6), bar(3, 5, 8), bar(4, 7, 9)]);
    expect(lanes.map((l) => l.map((b) => b.item.runId))).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('does not let two bars share a day', () => {
    expect(packLanes([bar(1, 0, 3), bar(2, 3, 5)])).toHaveLength(2);
  });
});

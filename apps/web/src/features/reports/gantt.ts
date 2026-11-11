/** Pure model of the release Gantt: lanes of bars per topic or per person over a day range. */
import { progressOf, type ScheduleDTO, type ScheduleItemDTO } from '@tmt/shared';
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export type GanttGroup = 'topic' | 'person';

export interface GanttBar {
  item: ScheduleItemDTO;
  /** Days from the start of the range (0-based) to the first and last day, both included. */
  from: number;
  to: number;
  /** Due date passed and the run is not fully executed. */
  late: boolean;
}

export interface GanttRow {
  key: string;
  label: string;
  /** Bars that do not overlap are stacked in the same lane. */
  lanes: GanttBar[][];
}

export interface GanttTick {
  day: number;
  label: string;
}

export interface GanttModel {
  start: string;
  /** Days in the range. */
  days: number;
  ticks: GanttTick[];
  /** Day index of today, when it is inside the range. */
  today: number | null;
  rows: GanttRow[];
  /** Runs with neither a start nor a due date. */
  unscheduled: ScheduleItemDTO[];
}

export const NO_TOPIC = 'No topic';
export const NO_PERSON = 'Not handed out';

function dayOf(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

function groupOf(item: ScheduleItemDTO, by: GanttGroup): { key: string; label: string } {
  if (by === 'topic') {
    const topic = item.topic?.trim() ?? '';
    return { key: topic, label: topic || NO_TOPIC };
  }
  return item.tester
    ? { key: String(item.tester.id), label: item.tester.displayName }
    : { key: '', label: NO_PERSON };
}

/** Stacks bars into the fewest lanes where no two bars of a lane share a day. */
export function packLanes(bars: readonly GanttBar[]): GanttBar[][] {
  const lanes: GanttBar[][] = [];
  const sorted = bars.toSorted((a, b) => a.from - b.from || a.to - b.to);
  for (const bar of sorted) {
    const lane = lanes.find((l) => l.at(-1)!.to < bar.from);
    if (lane) lane.push(bar);
    else lanes.push([bar]);
  }
  return lanes;
}

/** Ticks every week (Mondays) for ranges up to ~3 months, every 2 weeks beyond. */
function ticksOf(start: Date, days: number): GanttTick[] {
  const step = days > 100 ? 14 : 7;
  const ticks: GanttTick[] = [];
  let first = 0;
  while (addDays(start, first).getDay() !== 1 && first < days) first += 1;
  for (let day = first; day < days; day += step) {
    ticks.push({ day, label: format(addDays(start, day), 'MMM d') });
  }
  return ticks;
}

/**
 * Rows by topic or by person, each run a bar from its start (the plan's start date) to its due
 * date. A run with only one of the two is a one-day bar; a run with neither is listed apart. The
 * range covers the release dates (when set) and every bar, with a day of margin.
 */
export function buildGantt(
  data: ScheduleDTO,
  by: GanttGroup,
  today: Date = new Date(),
): GanttModel | null {
  const scheduled: { item: ScheduleItemDTO; start: Date; end: Date }[] = [];
  const unscheduled: ScheduleItemDTO[] = [];
  for (const item of data.items) {
    const start = dayOf(item.start) ?? dayOf(item.due);
    const end = dayOf(item.due) ?? dayOf(item.start);
    if (!start || !end) unscheduled.push(item);
    else scheduled.push({ item, start, end: end < start ? start : end });
  }
  const edges = [dayOf(data.release?.startDate), dayOf(data.release?.endDate)].filter(
    (d): d is Date => d !== null,
  );
  for (const s of scheduled) edges.push(s.start, s.end);
  if (edges.length === 0) return null;

  const first = edges.reduce((a, b) => (a < b ? a : b));
  const last = edges.reduce((a, b) => (a > b ? a : b));
  const start = addDays(first, -1);
  const days = differenceInCalendarDays(last, start) + 2;
  const todayDay = differenceInCalendarDays(today, start);

  const rows = new Map<string, { label: string; bars: GanttBar[] }>();
  for (const s of scheduled) {
    const g = groupOf(s.item, by);
    const row = rows.get(g.key) ?? { label: g.label, bars: [] };
    const to = differenceInCalendarDays(s.end, start);
    row.bars.push({
      item: s.item,
      from: differenceInCalendarDays(s.start, start),
      to,
      late: today > s.end && progressOf(s.item.counts) < 1,
    });
    rows.set(g.key, row);
  }
  return {
    start: format(start, 'yyyy-MM-dd'),
    days,
    ticks: ticksOf(start, days),
    today: todayDay >= 0 && todayDay < days ? todayDay : null,
    rows: [...rows.entries()]
      .map(([key, r]) => ({ key, label: r.label, lanes: packLanes(r.bars) }))
      .toSorted(
        (a, b) =>
          Number(a.key === '') - Number(b.key === '') ||
          a.label.localeCompare(b.label, 'en', { numeric: true }),
      ),
    unscheduled,
  };
}
